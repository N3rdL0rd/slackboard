import { memo, useEffect, useMemo, useRef, type ComponentRef } from "react";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { Gym } from "../core/gyms";
import { c } from "../theme";

export interface MapFocus {
  lat: number;
  lon: number;
  zoom?: number;
  /** Bump to re-center on the same spot. */
  nonce: number;
}

/**
 * Map of gyms on OpenStreetMap tiles (Leaflet in a WebView: no map SDK, no API key). Markers are drawn on a
 * canvas so a few hundred stay smooth. Tapping one reports the gym id.
 */
export const GymMap = memo(function GymMap({ gyms, selectedId, focus, onSelect }: {
  gyms: Gym[]; selectedId: number | null; focus: MapFocus | null; onSelect: (id: number) => void;
}) {
  const web = useRef<ComponentRef<typeof WebView>>(null);
  const ready = useRef(false);
  // The page is built once per gym list; selection and centering are pushed in afterwards.
  const html = useMemo(() => page(gyms), [gyms]);

  const push = (js: string) => web.current?.injectJavaScript(`${js}; true;`);
  useEffect(() => { if (ready.current && selectedId != null) push(`window.selectGym(${selectedId})`); }, [selectedId]);
  useEffect(() => { if (ready.current && focus) push(`window.flyTo(${focus.lat}, ${focus.lon}, ${focus.zoom ?? 12})`); }, [focus]);

  const onMessage = (e: WebViewMessageEvent) => {
    const m = JSON.parse(e.nativeEvent.data) as { type: string; id?: number };
    if (m.type === "ready") {
      ready.current = true;
      if (selectedId != null) push(`window.selectGym(${selectedId})`);
      if (focus) push(`window.flyTo(${focus.lat}, ${focus.lon}, ${focus.zoom ?? 12})`);
    } else if (m.type === "select" && m.id != null) onSelect(m.id);
  };

  return (
    <WebView
      ref={web}
      originWhitelist={["*"]}
      // A real origin gives the tile server a Referer, which its usage policy asks for.
      source={{ html, baseUrl: "https://slackboard.app" }}
      onMessage={onMessage}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      style={{ flex: 1, backgroundColor: c.ground }}
      accessibilityLabel="Map of gyms"
    />
  );
});

function page(gyms: Gym[]): string {
  const data = JSON.stringify(gyms.map((g) => [g.id, g.latitude, g.longitude]));
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
html,body,#m{height:100%;margin:0;background:${c.ground}}
.leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.85) contrast(.9) saturate(.6)}
.leaflet-control-attribution{background:rgba(18,22,24,.85)!important;color:${c.muted}!important;font:11px sans-serif}
.leaflet-control-attribution a{color:${c.text2}!important}
</style></head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var gyms=${data};
var post=function(o){window.ReactNativeWebView.postMessage(JSON.stringify(o))};
var map=L.map('m',{zoomControl:false,preferCanvas:true,tap:true});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
var markers={}, selected=null;
var plain={radius:10,color:'${c.ground}',weight:2,fillColor:'${c.text}',fillOpacity:.95};
var chosen={radius:14,color:'${c.text}',weight:4,fillColor:'#34D17D',fillOpacity:1};
gyms.forEach(function(g){
  var m=L.circleMarker([g[1],g[2]],plain).addTo(map);
  m.on('click',function(){post({type:'select',id:g[0]})});
  markers[g[0]]=m;
});
window.selectGym=function(id){
  if(selected!=null&&markers[selected])markers[selected].setStyle(plain).setRadius(10);
  selected=id; var m=markers[id];
  if(m){m.setStyle(chosen).setRadius(14).bringToFront(); map.panTo(m.getLatLng());}
};
window.flyTo=function(lat,lon,z){map.setView([lat,lon],z)};
map.invalidateSize();
if(gyms.length){map.fitBounds(L.latLngBounds(gyms.map(function(g){return [g[1],g[2]]})),{padding:[20,20]})}else{map.setView([39,-98],4)}
post({type:'ready'});
</script></body></html>`;
}
