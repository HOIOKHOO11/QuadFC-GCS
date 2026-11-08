'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useGS } from '@/lib/qfc/store';

// Live GPS map with trail, heading marker and accuracy circle
export function MapView() {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const trailRef = useRef<L.Polyline | null>(null);
  const accRef = useRef<L.Circle | null>(null);
  const followRef = useRef(true);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { zoomControl: true, attributionControl: true });
    map.setView([35.715298, 51.404343], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);
    trailRef.current = L.polyline([], { color: '#34d399', weight: 3, opacity: 0.9 }).addTo(map);
    markerRef.current = L.marker([35.715298, 51.404343], {
      icon: L.divIcon({
        className: '',
        html: `<div id="qfc-arrow" style="width:34px;height:34px;transition:transform .3s;display:flex;align-items:center;justify-content:center">
          <svg width="30" height="30" viewBox="0 0 24 24"><path d="M12 2 L17 20 L12 16 L7 20 Z" fill="#34d399" stroke="#064e3b" stroke-width="1"/></svg>
        </div>`,
        iconSize: [34, 34], iconAnchor: [17, 17],
      }),
    }).addTo(map);
    accRef.current = L.circle([35.715298, 51.404343], { radius: 5, color: '#34d399', weight: 1, fillOpacity: 0.08 });
    mapRef.current = map;

    // follow toggle hook
    const btn = L.control({ position: 'topleft' });
    btn.onAdd = () => {
      const d = L.DomUtil.create('button', 'leaflet-bar');
      d.style.cssText = 'padding:4px 10px;background:#18181b;color:#e4e4e7;border:1px solid #3f3f46;border-radius:6px;cursor:pointer;font-size:12px;direction:rtl';
      d.textContent = 'دنبال‌کردن: روشن';
      d.onclick = () => {
        followRef.current = !followRef.current;
        d.textContent = `دنبال‌کردن: ${followRef.current ? 'روشن' : 'خاموش'}`;
      };
      return d;
    };
    btn.addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const lat = useGS(s => s.tel.lat);
  const lon = useGS(s => s.tel.lon);
  const course = useGS(s => s.tel.courseDeg);
  const hdop = useGS(s => s.tel.hdop);
  const trail = useGS(s => s.trail);
  const fresh = useGS(s => s.tel.gpsFix);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || lat === null || lon === null) return;
    markerRef.current?.setLatLng([lat, lon]);
    if (accRef.current) {
      accRef.current.setLatLng([lat, lon]);
      accRef.current.setRadius(Math.max(3, (hdop ?? 2) * 3.5));
    }
    const el = document.getElementById('qfc-arrow');
    if (el && course !== null) el.style.transform = `rotate(${course}deg)`;
    if (followRef.current) map.setView([lat, lon], Math.max(map.getZoom(), 15));
  }, [lat, lon, course, hdop]);

  useEffect(() => {
    if (trailRef.current && trail.length > 1) {
      trailRef.current.setLatLngs(trail.map(p => [p.lat, p.lon]));
    }
  }, [trail]);

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-lg overflow-hidden border border-zinc-800">
      <div ref={divRef} className="absolute inset-0" />
      {fresh === 0 && (
        <div className="absolute bottom-3 inset-x-3 z-[500] rounded-md bg-zinc-900/90 border border-zinc-700 px-3 py-2 text-xs text-zinc-300 text-center">
          هنوز فیکس GPS نداریم — تا وقتی فیکس بگیرد آخرین موقعیت معلوم نمایش داده می‌شود.
        </div>
      )}
    </div>
  );
}
