import math, os, json, subprocess, time
from PIL import Image, ImageDraw
OUT='/home/user/yeulmaru-promo/image'; SS=2
ACCENT=(74,77,231)
FILL={'여수':(240,196,184),'순천':(150,205,160),'광양':(242,166,196)}  # 살몬/파스텔그린/파스텔핑크
HJD='/tmp/hjd.geojson'; UA='yeulmaru-promo/1.0 (map; ems1130g@gmail.com)'
MAPS={
 'all':      {'z':11,'x0':1748,'y0':811,'nx':4,'ny':3,'cities':['여수','순천','광양'],'major_only':True},
 'yeosu':    {'z':13,'x0':6999,'y0':3250,'nx':4,'ny':3,'cities':['여수'],'major_only':False},
 'suncheon': {'z':13,'x0':6995,'y0':3244,'nx':4,'ny':4,'cities':['순천'],'major_only':False},
 'gwangyang':{'z':13,'x0':7000,'y0':3245,'nx':4,'ny':3,'cities':['광양'],'major_only':False},
}
MAJOR={'motorway','trunk','primary','secondary','motorway_link','trunk_link','primary_link'}
ALLROADS=MAJOR|{'tertiary','residential','unclassified','living_street','secondary_link','tertiary_link'}
W={'motorway':3,'trunk':3,'motorway_link':1.6,'trunk_link':1.6,'primary':2.6,'primary_link':1.4,'secondary':2.1,'secondary_link':1.3,'tertiary':1.7,'tertiary_link':1.2,'residential':1.2,'unclassified':1.2,'living_street':1.1}
def y2lat(yt,n): return math.degrees(math.atan(math.sinh(math.pi*(1-2*yt/n))))
def bnds(m):
    n=2**m['z']; return y2lat(m['y0']+m['ny'],n), m['x0']/n*360-180, y2lat(m['y0'],n), (m['x0']+m['nx'])/n*360-180
def proj(lat,lng,m):
    n=2**m['z']; xt=(lng+180)/360*n; yt=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n
    return ((xt-m['x0'])*256*SS,(yt-m['y0'])*256*SS)
def roads(m,key):
    c=f'/tmp/roads_{key}.json'
    if os.path.exists(c) and os.path.getsize(c)>100:
        try: return json.load(open(c))
        except: pass
    S,Wd,N,E=bnds(m); cls='|'.join(sorted(MAJOR if m['major_only'] else ALLROADS))
    q=f'[out:json][timeout:80];way[highway~"^({cls})$"]({S},{Wd},{N},{E});out geom;'
    for _ in range(3):
        subprocess.run(['curl','-s','--max-time','90','-X','POST','https://overpass-api.de/api/interpreter','-H',f'User-Agent: {UA}','--data-urlencode','data='+q,'-o',c],capture_output=True)
        try:
            d=json.load(open(c))
            if 'elements' in d: return d
        except: pass
        time.sleep(6)
    return {'elements':[]}
hjd=json.load(open(HJD)); dong={}
for f in hjd['features']:
    nm=f.get('properties',{}).get('adm_nm','')
    for c in ['여수','순천','광양']:
        if c in nm: dong.setdefault(c,[]).append(f)
def rings(g):
    out=[]
    ps=[g['coordinates']] if g['type']=='Polygon' else (g['coordinates'] if g['type']=='MultiPolygon' else [])
    for poly in ps:
        for r in poly: out.append(r)
    return out
def exteriors(g):
    out=[]
    ps=[g['coordinates']] if g['type']=='Polygon' else (g['coordinates'] if g['type']=='MultiPolygon' else [])
    for poly in ps:
        if poly: out.append(poly[0])
    return out
def layer(mask,color,a):
    al=mask.point(lambda v:a if v>0 else 0)
    L=Image.new('RGBA',mask.size,color+(0,)); L.putalpha(al); return L
for key,m in MAPS.items():
    Wpx,Hpx=m['nx']*256*SS,m['ny']*256*SS
    ov=Image.new('RGBA',(Wpx,Hpx),(0,0,0,0))
    # 1) 도시 행정구역 채우기 20%
    for c in m['cities']:
        fm=Image.new('L',(Wpx,Hpx),0); fd=ImageDraw.Draw(fm)
        for f in dong.get(c,[]):
            for ext in exteriors(f['geometry']):
                pts=[proj(p[1],p[0],m) for p in ext]
                if len(pts)>=3: fd.polygon(pts,fill=255)
        ov=Image.alpha_composite(ov,layer(fm,FILL[c],51))
    # 2) 도로 강조색 20%
    rm=Image.new('L',(Wpx,Hpx),0); rd=ImageDraw.Draw(rm); nr=0
    for el in roads(m,key).get('elements',[]):
        g=el.get('geometry')
        if not g or len(g)<2: continue
        hw=el.get('tags',{}).get('highway','residential')
        rd.line([proj(p['lat'],p['lon'],m) for p in g],fill=255,width=max(1,round(W.get(hw,1.2)*SS)),joint='curve'); nr+=1
    ov=Image.alpha_composite(ov,layer(rm,ACCENT,51))
    # 3) 동 경계 강조색 50%
    bm=Image.new('L',(Wpx,Hpx),0); bd=ImageDraw.Draw(bm); nb=0
    for c in m['cities']:
        for f in dong.get(c,[]):
            for r in rings(f['geometry']):
                pts=[proj(p[1],p[0],m) for p in r]
                if len(pts)>1: bd.line(pts,fill=255,width=max(1,round(1.5*SS)),joint='curve'); nb+=1
    ov=Image.alpha_composite(ov,layer(bm,ACCENT,120))
    ov=ov.resize((m['nx']*256,m['ny']*256),Image.LANCZOS)
    ov.save(os.path.join(OUT,f'promomap-ov-{key}.png'))
    print(f"{key}: fill {m['cities']} · roads {nr} · 경계 {nb} · {os.path.getsize(os.path.join(OUT,f'promomap-ov-{key}.png'))//1024}KB")
