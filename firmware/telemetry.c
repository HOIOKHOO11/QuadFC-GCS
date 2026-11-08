#include "telemetry.h"
#include "fc_config.h"
#include "hc12_link.h"
#include "crc16.h"
#include "ahrs.h"
#include "control.h"
#include "navigator.h"
#include "flight.h"
#include "motors.h"
#include "storage.h"
#include "ms5611.h"
#include "hcsr04.h"
#include "battery.h"
#include "gps_nmea.h"
#include "ppm.h"
#include "mpu6050.h"
#include "hmc5883l.h"
#include "app_tasks.h"
#include "cli_console.h"

#include "stm32f1xx_hal.h"
#include "FreeRTOS.h"
#include "task.h"
#include <string.h>
#include <math.h>

static link_state_t s_link;
static uint8_t  s_seq = 0;
extern volatile uint8_t g_test_abort_reason;   /* motors.c (review #17) */
static uint8_t  s_rxbuf[TEL_MAX_PAYLOAD + 16];
static uint16_t s_rxlen = 0;
static int32_t  s_home_lat = 0, s_home_lon = 0;
static float    s_home_alt = 0.0f;

/* ---------- ساخت و ارسال فریم ----------
 * ترتیب بایت‌ها: [A5][5A][LEN][TYPE][SEQ][PAYLOAD...][CRC_L][CRC_H] */
static bool send_frame(uint8_t type, const uint8_t *payload, uint8_t len)
{
    uint8_t hdr[5];
    hdr[0] = TEL_PREAMBLE0;
    hdr[1] = TEL_PREAMBLE1;
    hdr[2] = len;
    hdr[3] = type;
    hdr[4] = s_seq++;

    /* CRC روی TYPE+SEQ+PAYLOAD */
    uint16_t crc = crc16_ccitt(&hdr[3], 2, 0xFFFF);
    if (len) crc = crc16_ccitt(payload, len, crc);

    if (hc12_tx_free() < (uint16_t)(len + 7)) return false;
    hc12_send(hdr, 5);
    if (len) hc12_send(payload, len);
    uint8_t c[2] = { (uint8_t)(crc & 0xFF), (uint8_t)(crc >> 8) };
    hc12_send(c, 2);
    s_link.tx_frames++;
    return true;
}

/* ---------- پاکت وضعیت (فشرده ~36 بایت) ---------- */
static void send_status(void)
{
    uint8_t p[TEL_MAX_PAYLOAD];
    euler_t e = ahrs_get_euler();
    baro_data_t b = baro_get();
    batt_state_t bt = battery_get();
    (void)bt;
    const ctrl_target_t *tg = flight_get_target();
    (void)tg;
    gps_state_t gps = gps_get();
    float sonar_cm = -1.0f;
    (void)sonar_get_last_cm(&sonar_cm);

    uint16_t idx = 0;
#define PUSH16(v) do { int16_t _v = (int16_t)(v); p[idx++] = (uint8_t)(_v & 0xFF); p[idx++] = (uint8_t)((_v >> 8) & 0xFF); } while (0)
#define PUSH32(v) do { int32_t _v = (int32_t)(v); \
    p[idx++] = (uint8_t)(_v & 0xFF); p[idx++] = (uint8_t)((_v >> 8) & 0xFF); \
    p[idx++] = (uint8_t)((_v >> 16) & 0xFF); p[idx++] = (uint8_t)((_v >> 24) & 0xFF); } while (0)

    PUSH16((int16_t)(e.roll  * 100.0f));
    PUSH16((int16_t)(e.pitch * 100.0f));
    PUSH16((int16_t)(e.yaw   * 100.0f));
    PUSH16((int16_t)(b.rel_alt_m * 100.0f));            /* ارتفاع cm */
    PUSH16((int16_t)(sonar_cm * 10.0f));                /* ارتفاع زمین mm/10 */
    PUSH16((int16_t)(bt.voltage_v * 100.0f));           /* ولتاژ 10mV */
    p[idx++] = bt.percent;
    PUSH32(s_home_lat ? s_home_lat : gps.lat_e7);
    PUSH32(s_home_lon ? s_home_lon : gps.lon_e7);
    PUSH32(gps.lat_e7);
    PUSH32(gps.lon_e7);
    PUSH16(gps.speed_cms);
    PUSH16(gps.course_cdeg);
    p[idx++] = (uint8_t)((gps.sats << 4) | (gps.fix ? 0x08 : 0) | (gps.hdop_x10 < 30 ? 0x04 : 0));
    p[idx++] = (uint8_t)flight_mode_now();
    p[idx++] = (uint8_t)flight_sys_state();
    p[idx++] = flight_status_flags();
    p[idx++] = (uint8_t)(nav_hover_throttle() * 200.0f);   /* runtime (نه persist) */
    p[idx++] = s_link.quality_pct;
    PUSH16((int16_t)(flight_alt_target_m() * 10.0f));

    /* --- نسخه 2: بایت سلامت + بایت وضعیت مانور (req 42؛ backward-compatible:
     * گس‌های قدیمی فقط 41 بایت اول را می‌خوانند) --- */
    const ctrl_health_t *ch = control_health();
    uint8_t health = 0;
    if (ch->imu_ok && !ch->imu_fault)      health |= HEALTH_IMU_OK;
    if (baro_get().ok)                     health |= HEALTH_BARO_OK;
    if (sonar_valid())                     health |= HEALTH_SONAR_OK;
    if (gps_quality_ok())                  health |= HEALTH_GPS_FRESH;
    if (nav_alt_valid())                   health |= HEALTH_ALT_VALID;
    if (!ppm_link_ok())                    health |= HEALTH_RC_FAILSAFE;
    if (!s_link.link_ok)                   health |= HEALTH_GCS_FAILSAFE;
    if (motors_safety_fault())             health |= HEALTH_MOTOR_FAULT;
    p[idx++] = health;
    p[idx++] = nav_state_code();          /* مراحل Takeoff/Land/RTH          */

    /* --- v2.2 (protocol 1.2): فیلدهای لاگ/سلامت (review #2/#17/#23) --- */
    const loop_stats_t *ls = control_loop_stats();
    PUSH16((int16_t)ls->loop_max_us);                     /* WCET حلقه     */
    PUSH16((int16_t)(ls->overruns & 0xFFFF));
    PUSH16((int16_t)(nav_climb_rate_mps() * 100.0f));     /* vz cm/s       */
    {
        uint32_t rage = ppm_age_ms();
        p[idx++] = (uint8_t)((rage > 2550u) ? 255u : rage / 10u);  /* RC age */
    }
    p[idx++] = flight_arm_denied_reason();               /* دلیل رد Arm    */
    {
        uint8_t h2 = 0;
        if (mpu6050_gyro_cal_stale())     h2 |= 0x01;   /* bias کهنه      */
#if USE_MAG
        if (strcmp(mag_chip_name(), "NONE") != 0 && !mag_field_ok()) h2 |= 0x02;
#endif
        if (battery_get().current_present) h2 |= 0x08;  /* INA219 حاضر   */
        p[idx++] = h2;
    }
    p[idx++] = nav_home_gate_fail();                     /* دلیل رد خانه   */
    {
        /* 0x80 = تست موتور فعال | بیت‌های 0..2 = دلیل توقف قبلی          */
        p[idx++] = motors_test_active() ? (uint8_t)(0x80 | g_test_abort_reason)
                                        : g_test_abort_reason;
    }

#undef PUSH16
#undef PUSH32

    send_frame(TEL_STATUS, p, idx);   /* 54 بایت (protocol 1.2: 41+2+11) */
}

/* ---------- Debug چرخشی (req 44) ----------
 * هر فریم: [slot][4×float LE] — اسلات‌ها 0..N-1 می‌چرخند؛ هیچ بلاکی در
 * حلقه کنترل ایجاد نمی‌کند (ارسال با ringbuf غیرمسدودکننده).               */
static void send_debug_slot(uint8_t slot)
{
    float f[4] = {0, 0, 0, 0};
    euler_t e = ahrs_get_euler();
    const ctrl_target_t *tg = flight_get_target();
    const ctrl_health_t *ch = control_health();
    const loop_stats_t *ls = control_loop_stats();   /* v2.2 */
    uint16_t us[4]; motors_get_last_us(us);
    float sonar_cm = -1.0f; sonar_get_last_cm(&sonar_cm);
    baro_data_t b = baro_get();
    batt_state_t bt = battery_get();
    gps_state_t g = gps_get();
    float p, i, d;
    control_get_pid_terms(&p, &i, &d);
    float tqr, tqp, tqy; control_get_torque(&tqr, &tqp, &tqy);

    switch (slot % DEBUG_SLOT_COUNT) {
    case 0: f[0] = ch->loop_us / 1000.0f; f[1] = (float)ch->loop_us;
            f[2] = e.roll;  f[3] = e.pitch; break;
    case 1: f[0] = e.yaw; f[1] = g_mpu.gyro_dps.x; f[2] = g_mpu.gyro_dps.y;
            f[3] = g_mpu.gyro_dps.z; break;
    case 2: f[0] = g_mpu.acc_g.x; f[1] = g_mpu.acc_g.y; f[2] = g_mpu.acc_g.z;
            f[3] = tg->throttle; break;
    case 3: f[0] = tg->roll_deg; f[1] = tg->pitch_deg;
            f[2] = tg->yaw_rate_dps; f[3] = tqr; break;
    case 4: f[0] = tqp; f[1] = tqy; f[2] = p; f[3] = i; break;
    case 5: f[0] = d; f[1] = (float)us[0]; f[2] = (float)us[1];
            f[3] = (float)us[2]; break;
    case 6: f[0] = (float)us[3]; f[1] = nav_alt_m(); f[2] = nav_climb_rate_mps();
            f[3] = sonar_cm; break;
    case 7: f[0] = b.rel_alt_m; f[1] = (float)gps_age_ms() / 1000.0f;
            f[2] = (float)g.lat_e7; f[3] = (float)g.lon_e7; break;
    case 8: f[0] = nav_home_dist_m(); f[1] = bt.voltage_v;
            f[2] = (float)flight_status_flags(); f[3] = (float)nav_state_code(); break;
    /* --- v2.2 (review #29): high-water-mark پشته‌ها (واژه 4B) --- */
    case 9:  f[0] = (float)app_hwm_words(0); f[1] = (float)app_hwm_words(1);
             f[2] = (float)app_hwm_words(2); f[3] = (float)app_hwm_words(3); break;
    case 10: f[0] = (float)app_hwm_words(4); f[1] = (float)app_hwm_words(5);
             f[2] = (float)app_hwm_words(6);
             f[3] = (float)xPortGetMinimumEverFreeHeapSize(); break;
    /* --- v2.2 (review #2/#13/#5): شمارنده‌های سلامت --- */
    case 11: {
        uint32_t acc_n = 0, rej_n = 0;
        ahrs_mag_stats(&acc_n, &rej_n);
        f[0] = (float)ls->i2c_timeouts;
        f[1] = (float)rej_n;
        f[2] = bt.consumed_mah;
        f[3] = bt.current_a * 100.0f;   /* cA */
        (void)acc_n;
        break;
    }
    default: break;
    }

    uint8_t pl[17];
    pl[0] = slot % DEBUG_SLOT_COUNT;
    memcpy(&pl[1], f, 16);
    send_frame(TEL_DEBUG, pl, 17);
}

/* ---------- Heartbeat ---------- */
static void send_heartbeat(void)
{
    uint8_t p[4];
    p[0] = flight_status_flags();
    p[1] = (uint8_t)flight_mode_now();
    p[2] = s_link.quality_pct;
    p[3] = (uint8_t)(HAL_GetTick() & 0xFF);
    send_frame(TEL_HEARTBEAT, p, 4);
}

/* ---------- ACK ---------- */
static void send_ack(uint8_t seq_of_cmd, uint8_t code)
{
    uint8_t p[2] = { seq_of_cmd, code };
    send_frame(TEL_ACK, p, 2);
    s_link.ack_sent++;
}

/* ---------- پردازش فرمان دریافتی ---------- */
static void handle_cmd(const uint8_t *pl, uint8_t len, uint8_t seq)
{
    if (len < 1) return;
    uint8_t ack = ACK_OK;
    tel_cmd_t cmd = (tel_cmd_t)pl[0];

    switch (cmd) {
    case CMD_ARM:       if (!flight_request_arm(FLIGHT_SRC_GCS))   ack = ACK_ERR_STATE; break;
    case CMD_DISARM:    flight_request_disarm(FLIGHT_SRC_GCS);     break;
    case CMD_TAKEOFF:   if (!flight_request_takeoff(FLIGHT_SRC_GCS)) ack = ACK_ERR_STATE; break;
    case CMD_LAND:      if (!flight_request_land(FLIGHT_SRC_GCS))  ack = ACK_ERR_STATE; break;
    case CMD_RTH:       if (!flight_request_rth(FLIGHT_SRC_GCS))   ack = ACK_ERR_STATE; break;
    case CMD_CANCEL:    flight_cancel_auto(FLIGHT_SRC_GCS);        break;
    case CMD_CAL_ACC:   if (!flight_start_calib(FLIGHT_CAL_ACC))   ack = ACK_ERR_STATE; break;
    case CMD_CAL_MAG:   if (!flight_start_calib(FLIGHT_CAL_MAG))   ack = ACK_ERR_STATE; break;
    case CMD_CAL_MAG_FIN:
        /* v2.3: پایان صریح پنجره کالیبراسیون مگ (قبلاً پنجره باگ داشت) */
        if (!flight_finish_mag_cal()) ack = ACK_ERR_STATE;
        break;
    case CMD_SAVE_CFG:  if (!flight_save_config())                 ack = ACK_ERR_STATE; break;
    case CMD_MOTOR_TEST:
        /* v2.2 (review #17): تست با توقف خودکار؛ idx=0xFF = توقف دستی */
        if (len >= 1 && pl[1] == 0xFF) {
            motors_test_stop();
        } else if (len >= 4) {
            if (flight_sys_state() != SYS_ARMED) {
                uint16_t us = (uint16_t)(pl[2] | (pl[3] << 8));
                if (!motors_test_start(pl[1], us)) ack = ACK_ERR_STATE;
            } else ack = ACK_ERR_STATE;
        } else ack = ACK_ERR_PARAM;
        break;
    case CMD_CAL_ACC6:
        /* v2.2 (review #20): هر فراخوان یک صورت (payload=[face 0..5]) */
        if (len >= 2) {
            if (!flight_start_calib_acc6(pl[1])) ack = ACK_ERR_STATE;
        } else ack = ACK_ERR_PARAM;
        break;
    case CMD_SET_MAG_MAT:
        /* v2.2 (review #21): 9×float LE — سطر-اصلی */
        if (len >= 37) {
            float m[9];
            memcpy(m, &pl[1], 36);
            if (!flight_set_mag_matrix(m)) ack = ACK_ERR_STATE;
        } else ack = ACK_ERR_PARAM;
        break;
#if ENABLE_FAULT_INJECTION
    case CMD_FAULT_INJ:
        /* v2.2 (review #24): فقط بنچ بدون ملخ! 1=فریز کنترل 2=رها */
        if (len >= 2) {
            extern volatile uint8_t g_fault_inject;
            g_fault_inject = (pl[1] == 1) ? 1u : 0u;
        } else ack = ACK_ERR_PARAM;
        break;
#endif
    case CMD_SET_HOVER:
        if (len >= 5) {
            float h;
            memcpy(&h, &pl[1], 4);
            /* P1-1: از مسیر navigator اعمال شود (runtime فوری + dirty برای
             * ذخیره تعلیق‌شده). نوشتن مستقیم blob قبلاً runtime را دور
             * می‌زد (اثر فقط بعد از ریست!) و تفکیک runtime/persist را
             * می‌شکست. */
            if (!nav_set_hover_throttle(h)) ack = ACK_ERR_PARAM;
        } else ack = ACK_ERR_PARAM;
        break;
    case CMD_REBOOT:    NVIC_SystemReset(); break;
    default:            ack = ACK_ERR_PARAM; break;
    }
    send_ack(seq, ack);
}

/* ---------- مونتاژ فریم دریافتی ---------- */
static void feed_byte(uint8_t b)
{
    static uint8_t st = 0, type = 0, seq = 0, len = 0;

    switch (st) {
    case 0: if (b == TEL_PREAMBLE0) st = 1; break;
    case 1: st = (b == TEL_PREAMBLE1) ? 2 : 0; break;
    case 2: len = b;
            if (len > TEL_MAX_PAYLOAD) { st = 0; s_link.crc_errors++; }
            else st = 3;
            break;
    case 3: type = b; st = 4; break;
    case 4: seq = b; s_rxlen = 0; st = (len) ? 5 : 6; break;
    case 5: s_rxbuf[s_rxlen++] = b;
            if (s_rxlen >= len) st = 6;
            break;
    case 6: {
        /* دو بایت CRC */
        static uint8_t ci = 0;
        static uint16_t rx_crc = 0;
        if (ci == 0) { rx_crc = b; ci = 1; break; }
        rx_crc |= (uint16_t)b << 8;
        ci = 0;
        st = 0;
        s_link.rx_frames++;

        uint16_t crc = crc16_ccitt(&type, 2, 0xFFFF);
        crc = crc16_ccitt(s_rxbuf, len, crc);
        if (crc != rx_crc) { s_link.crc_errors++; break; }

        if (type == TEL_CMD) handle_cmd(s_rxbuf, len, seq);
        else if (type == TEL_HEARTBEAT) {
            /* ضربان زمینی دریافت شد */
            s_link.last_hb_ms = HAL_GetTick();
            s_link.hb_missed = 0;
            /* پاسخ ضربان فوری برای اندازه‌گیری کیفیت دوطرفه */
        }
        break;
    }
    default: st = 0; break;
    }
}

/* ---------- تسک اصلی ---------- */
void telemetry_task(void)
{
    /* دریافت: v2.3 — دیمالتیکسر کنسول متنی/فریم باینری (مأموریت §10).
     * cli_console خط متنی PuTTY را می‌گیرد و فریم‌های باینری GCS را
     * دست‌نخورده به feed_byte می‌دهد. */
    uint8_t b;
    while (hc12_read_byte(&b)) cli_console_feed(b);

    uint32_t now = HAL_GetTick();

    /* محاسبه کیفیت لینک طبق تم: Heartbeat 500ms، سه بار غیبت = قطع */
    uint32_t since_hb = now - s_link.last_hb_ms;
    s_link.link_ok = (s_link.last_hb_ms != 0) && (since_hb < FS_HB_LOST_COUNT * 500u);
    if (!s_link.link_ok) s_link.hb_missed = (uint16_t)(since_hb / 500u);
    /* کیفیت: از نسبت زمان بدون قطع + نرخ خطا */
    uint8_t q = 100;
    if (s_link.last_hb_ms == 0) q = 0;
    else if (!s_link.link_ok) q = 0;
    else if (since_hb > 1000) q = 40;
    else if (since_hb > 500) q = 70;
    if (s_link.crc_errors > 0 && q > 0) {
        uint16_t total = s_link.rx_frames + s_link.crc_errors;
        if (total > 50) {
            uint8_t loss = (uint8_t)(100u * s_link.crc_errors / total);
            if (q > loss) q = (uint8_t)(q - loss);
        }
    }
    s_link.quality_pct = q;

    /* ارسال دوره‌ای */
    static uint32_t t_status = 0, t_hb = 0, t_dbg = 0;
    static uint8_t dbg_slot = 0;
    if (now - t_hb >= 500) {          /* Heartbeat 2Hz طبق تم */
        t_hb = now;
        send_heartbeat();
    }
    if (now - t_status >= (1000 / TELEMETRY_HZ)) {
        t_status = now;
        send_status();
    }
#if USE_TELEMETRY && DEBUG_HZ
    if (now - t_dbg >= (1000 / DEBUG_HZ)) {
        t_dbg = now;
        send_debug_slot(dbg_slot++);
    }
#endif
}

bool telemetry_init(void)
{
    memset(&s_link, 0, sizeof(s_link));
    s_rxlen = 0;
    return true;
}

link_state_t telemetry_link(void) { return s_link; }

/* v2.3: ورودی عمومی بایت فریم باینری — سینک ثبت‌شده در cli_console
 * (دیمالتیکسر RX). خارج از telemetry_task صدا زده نشود.                */
void telemetry_feed_byte(uint8_t b) { feed_byte(b); }

void telemetry_send_event(uint8_t code, uint8_t arg)
{
    uint8_t p[2] = { code, arg };
    send_frame(TEL_EVENT, p, 2);
}

void telemetry_set_home(int32_t lat_e7, int32_t lon_e7, float home_alt_m)
{
    s_home_lat = lat_e7;
    s_home_lon = lon_e7;
    s_home_alt = home_alt_m;
}
