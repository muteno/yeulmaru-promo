promomap-*.jpg = 홍보 지도 폴백 배경(약식 위치도)용 정적 지도.
스타일: CartoDB Positron (light_nolabels) — 지형·산·라벨 없이 해안선·도로선·행정경계·물/땅 윤곽만(운영자 요구 260704).
출처: © OpenStreetMap 기여자, © CARTO (https://carto.com/basemaps, https://www.openstreetmap.org/copyright).
재생성: tools/scratch/bake_promomap.py (STYLE=light_nolabels).
좌표 메타(z/타일원점/크기)는 index.html _PMAP_FB_MAPS 와 반드시 일치해야 함.

promomap-ov-*.png = 강조색 오버레이(투명): 도로(강조색 #4A4DE7 20%) + 행정동 경계(강조색 50%).
  도로 = OSM Overpass, 동 경계 = 행정동 GeoJSON(vuski/admdongkor). basemap과 같은 타일좌표라 정렬 정확.
  재생성: tools/scratch/bake_overlay.py (Overpass POST+UA 필요, 행정동 GeoJSON 전국본 필터).
