/**
 * @file    telemetry.h
 * @brief   پروتکل تلمتری دوطرفه روی HC-12
 *          فریم: [0xA5][0x5A][LEN][TYPE][SEQ][PAYLOAD...][CRC16_L][CRC16_H]
 *          LEN = طول PAYLOAD؛ CRC16-CCITT روی TYPE+SEQ+PAYLOAD
 * ویژگی‌های طبق تم: ACK، Heartbeat 2Hz، کیفیت لینک، فشرده‌سازی باینری
 */
#ifndef TELEMETRY_H
#define TELEMETRY_H

#include "fc_types.h"
#include <stdbool.h>
#include <stdint.h>

#define TEL_PREAMBLE0   0xA5
#define TEL_PREAMBLE1   0x5A
#define TEL_MAX_PAYLOAD 64      /* v2.2: STATUS v3 + ماتریس مگ 36 بایتی  */

/* انواع فریم */
typedef enum {
    TEL_HEARTBEAT   = 0x01,     /* ضربان دوطرفه                          */
    TEL_STATUS      = 0x02,     /* استریم وضعیت 10Hz (کواد → زمین)       */
    TEL_ACK         = 0x03,     /* تایید فرمان (کواد → زمین)             */
    TEL_EVENT       = 0x04,     /* رخداد (کواد → زمین)                   */
    TEL_CMD         = 0x10,     /* فرمان (زمین → کواد)                   */
    TEL_DEBUG       = 0x11,     /* جریان اشکال‌زدایی                      */
} tel_type_t;

/* زیرفرمان‌های TEL_CMD */
typedef enum {
    CMD_ARM         = 0x01,
    CMD_DISARM      = 0x02,
    CMD_TAKEOFF     = 0x03,
    CMD_LAND        = 0x04,
    CMD_RTH         = 0x05,
    CMD_CAL_ACC     = 0x06,
    CMD_CAL_MAG     = 0x07,
    CMD_SAVE_CFG    = 0x08,
    CMD_MOTOR_TEST  = 0x09,     /* payload: [motor_idx][pulse_lo][pulse_hi] */
    CMD_SET_HOVER   = 0x0A,     /* payload: float 4 بایتی                   */
    CMD_CANCEL      = 0x0B,     /* لغو دستور خودکار جاری                    */
    CMD_REBOOT      = 0x0C,
    CMD_CAL_ACC6    = 0x0D,     /* v2.2: payload=[face]; shesh bar face 0..5 */
    CMD_SET_MAG_MAT = 0x0E,     /* v2.2: payload=9xfloat LE (36B) (#21)      */
    CMD_FAULT_INJ   = 0x0F,     /* v2.2: faqat ba ENABLE_FAULT_INJECTION=1   */
    CMD_CAL_MAG_FIN = 0x14,     /* v2.3: پایان پنجره کالیبراسیون مگ          */
} tel_cmd_t;

/* کدهای ACK */
typedef enum {
    ACK_OK          = 0x00,
    ACK_ERR_BUSY    = 0x01,
    ACK_ERR_STATE   = 0x02,     /* حالت فعلی اجازه نمی‌دهد */
    ACK_ERR_CALIB   = 0x03,     /* کالیبراسیون نامعتبر */
    ACK_ERR_PARAM   = 0x04,
} tel_ack_t;

/* کدهای رخداد */
typedef enum {
    EVT_HOME_SET    = 0x01,
    EVT_HOVER_LEARN = 0x02,
    EVT_CALIB_DONE  = 0x03,
    EVT_FAILSAFE    = 0x04,
    EVT_LANDED      = 0x05,
    EVT_LOW_BATT    = 0x06,
    EVT_LINK_LOST   = 0x07,
} tel_event_t;

/* وضعیت لینک زمینی */
typedef struct {
    bool     link_ok;           /* Heartbeat در 1.5s اخیر (طبق تم)        */
    uint8_t  quality_pct;       /* کیفیت لینک 0..100                      */
    uint16_t hb_missed;         /* تعداد ضربان‌های گم‌شده                  */
    uint16_t tx_frames;
    uint16_t rx_frames;
    uint16_t crc_errors;
    uint16_t ack_sent;
    uint32_t last_hb_ms;
} link_state_t;

bool telemetry_init(void);
/* از تسک تلمتری - استریم + دریافت فریم‌ها */
void telemetry_task(void);
/* v2.3: ورودی بایت فریم باینری (سینک دیمالتیکسر کنسول متنی) */
void telemetry_feed_byte(uint8_t b);
/* وضعیت لینک */
link_state_t telemetry_link(void);
/* رخداد برای زمین */
void telemetry_send_event(uint8_t code, uint8_t arg);
/* مختصات خانه برای پاکت وضعیت (از فلایت‌منیجر ثبت می‌شود) */
void telemetry_set_home(int32_t lat_e7, int32_t lon_e7, float home_alt_m);

/* بیت‌های وضعیت در پاکت HEARTBEAT */
#define HB_FLAG_ARMED       0x01
#define HB_FLAG_RC_OK       0x02
#define HB_FLAG_GCS_OK      0x04
#define HB_FLAG_GPS_FIX     0x08
#define HB_FLAG_FAILSAFE    0x10
#define HB_FLAG_AUTO_MODE   0x20

/* بایت سلامت STATUS (offset 41 — نسخه 2) (req 42) */
#define HEALTH_IMU_OK       0x01
#define HEALTH_BARO_OK      0x02
#define HEALTH_SONAR_OK     0x04
#define HEALTH_GPS_FRESH    0x08
#define HEALTH_ALT_VALID    0x10
#define HEALTH_RC_FAILSAFE  0x20
#define HEALTH_GCS_FAILSAFE 0x40
#define HEALTH_MOTOR_FAULT  0x80

#endif /* TELEMETRY_H */
