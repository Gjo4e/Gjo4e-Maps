import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Alert, Keyboard, Linking, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, View} from 'react-native';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapLibreGL from '@maplibre/maplibre-react-native';
import boundary from './src/data/macedonia-boundary.json';
import {createOutsideMask} from './src/services/geometry';
import {CENTER, CAMERA_BOUNDS, LIGHT_STYLE, DARK_STYLE, CITIES} from './src/config/map';

type Coord=[number,number];
type Place={id:string;name:string;coord:Coord;category:string;address?:string;website?:string};
type Category='Ресторани'|'Продавници'|'Бензински'|'Аптеки'|'Болници'|'Кафулиња'|'Банкомати';
const categories:Category[]=['Ресторани','Продавници','Бензински','Аптеки','Болници','Кафулиња','Банкомати'];
const osmTags:Record<Category,string>={
 'Ресторани':'["amenity"="restaurant"]',
 'Продавници':'["shop"]',
 'Бензински':'["amenity"="fuel"]',
 'Аптеки':'["amenity"="pharmacy"]',
 'Болници':'["amenity"="hospital"]',
 'Кафулиња':'["amenity"="cafe"]',
 'Банкомати':'["amenity"="atm"]'
};
function inCountry(p:Coord):boolean {
 const g:any=(boundary as any).features?.[0]?.geometry;
 if(!g)return false;
 const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;
 const inside=(ring:number[][])=>{
  let hit=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const a=ring[i],b=ring[j];
   if(((a[1]>p[1])!==(b[1]>p[1]))&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]))hit=!hit;
  }
  return hit;
 };
 return polygons.some((poly:number[][][])=>inside(poly[0])&&!poly.slice(1).some(inside));
}
function featureCollection(items:Place[]):any {
 return {type:'FeatureCollection',features:items.map(p=>({type:'Feature',properties:{id:p.id},geometry:{type:'Point',coordinates:p.coord}}))};
}
export default function App(){
 const dark=useColorScheme()==='dark',bg=dark?'#101827':'#f5f7fb',fg=dark?'#fff':'#172033';
 const [query,setQuery]=useState(''),[places,setPlaces]=useState<Place[]>([]),[selected,setSelected]=useState<Place|null>(null);
 const [origin,setOrigin]=useState<Coord|null>(null),[route,setRoute]=useState<any>(null),[routeInfo,setRouteInfo]=useState('');
 const [showBuildings,setShowBuildings]=useState(true);const [favorites,setFavorites]=useState<Place[]>([]),[showFavorites,setShowFavorites]=useState(false),[instructions,setInstructions]=useState<string[]>([]);
 const [busy,setBusy]=useState(false),[ready,setReady]=useState(false),[tilted,setTilted]=useState(false),[active,setActive]=useState<string>('Истражи');
 const camera=useRef<any>(null),mapCenter=useRef<Coord>(CENTER),requestId=useRef(0);
 const mask=useMemo(()=>createOutsideMask(boundary as any),[]);
 useEffect(()=>{AsyncStorage.getItem('mkspots:favorites').then(raw=>{if(raw)setFavorites(JSON.parse(raw));}).catch(()=>{});},[]);
 async function toggleFavorite(){if(!selected)return;const next=favorites.some(p=>p.id===selected.id)?favorites.filter(p=>p.id!==selected.id):[...favorites,selected];setFavorites(next);try{await AsyncStorage.setItem('mkspots:favorites',JSON.stringify(next));}catch{Alert.alert('Зачувани','Не може да се зачува местото.');}}
 function speakRoute(){if(!instructions.length){Alert.alert('Насоки','Прво пресметај рута.');return;}Speech.stop();Speech.speak(instructions.slice(0,8).join('. '),{language:'en-US',rate:0.9});}
 const cityMatches=query.trim().length>1?CITIES.filter(c=>(c.name+' '+c.aliases).toLowerCase().includes(query.trim().toLowerCase())).slice(0,5):[];
 function moveTo(p:Coord,zoom=14){mapCenter.current=p;camera.current?.setCamera({centerCoordinate:p,zoomLevel:zoom,animationDuration:650});}
 function choose(p:Place){setSelected(p);setQuery(p.name);setRoute(null);setRouteInfo('');setInstructions([]);Keyboard.dismiss();moveTo(p.coord);}
 async function searchText(){
  const q=query.trim();if(q.length<3){Alert.alert('Пребарување','Внеси најмалку 3 букви.');return;}
  Keyboard.dismiss();setBusy(true);
  try{
   // Submit-only search; no autocomplete requests to public Nominatim.
   const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=15&countrycodes=mk&q='+encodeURIComponent(q);
   const res=await fetch(url,{headers:{'Accept-Language':'mk,en'}});
   if(!res.ok)throw Error('Search unavailable');
   const data=await res.json();
   const found:Place[]=data.map((x:any)=>({id:'n'+x.place_id,name:x.display_name?.split(',')[0]||q,coord:[Number(x.lon),Number(x.lat)] as Coord,category:x.type||'Место',address:x.display_name})).filter((p:Place)=>inCountry(p.coord));
   setPlaces(found);setActive('Пребарување');
   if(found.length)moveTo(found[0].coord,12);else Alert.alert('Нема резултати','Не се пронајдени места во Македонија.');
  }catch{Alert.alert('Пребарување','Сервисот моментално не е достапен.');}
  finally{setBusy(false);}
 }
 async function loadCategory(cat:Category){
  setActive(cat);setSelected(null);setRoute(null);setRouteInfo('');setInstructions([]);
  const id=++requestId.current;setBusy(true);
  try{
   const c=mapCenter.current;
   // Limit each request to the visible vicinity; public Overpass is not a production SLA.
   const dLat=0.11,dLon=0.15,bbox=[c[1]-dLat,c[0]-dLon,c[1]+dLat,c[0]+dLon].join(',');
   const tag=osmTags[cat];
   const q='[out:json][timeout:20];(node'+tag+'('+bbox+');way'+tag+'('+bbox+'););out center 250;';
   let json:any=null;
   for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']){
    try{
     const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(q)});
     if(response.ok){json=await response.json();break;}
    }catch{}
   }
   if(!json)throw Error('Places service unavailable');
   const found:Place[]=(json.elements||[]).map((x:any)=>{
    const lat=x.lat??x.center?.lat,lon=x.lon??x.center?.lon;
    return {id:x.type+x.id,name:x.tags?.['name:mk']||x.tags?.name||cat,coord:[lon,lat] as Coord,category:cat,address:[x.tags?.['addr:street'],x.tags?.['addr:housenumber']].filter(Boolean).join(' '),website:x.tags?.website};
   }).filter((p:Place)=>Number.isFinite(p.coord[0])&&Number.isFinite(p.coord[1])&&inCountry(p.coord)).slice(0,120);
   if(id!==requestId.current)return;
   setPlaces(found);
   if(!found.length)Alert.alert(cat,'Нема означени објекти во овој дел од мапата. Приближи друг град и обиди се повторно.');
  }catch{Alert.alert('Места','Сервисот за објекти е привремено недостапен.');}
  finally{if(id===requestId.current)setBusy(false);}
 }
 async function locate(){
  setBusy(true);
  try{
   const permission=await Location.requestForegroundPermissionsAsync();
   if(permission.status!=='granted'){Alert.alert('GPS','Дозволи пристап до локацијата во Android Settings.');return;}
   const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
   const p:Coord=[pos.coords.longitude,pos.coords.latitude];
   if(!inCountry(p)){Alert.alert('GPS','Моменталната локација не е во Македонија.');return;}
   setOrigin(p);moveTo(p,15);
  }catch{Alert.alert('GPS','Не можам да ја прочитам локацијата. Провери дали GPS е вклучен.');}
  finally{setBusy(false);}
 }
 async function routeTo(){
  if(!selected){Alert.alert('Рута','Прво избери место од резултатите.');return;}
  if(!origin){Alert.alert('GPS','Прво притисни „Моја локација“.');return;}
  setBusy(true);
  try{
   const url='https://router.project-osrm.org/route/v1/driving/'+origin.join(',')+';'+selected.coord.join(',')+'?overview=full&geometries=geojson&steps=true';
   const res=await fetch(url);if(!res.ok)throw Error('Route unavailable');
   const json=await res.json(),best=json.routes?.[0];
   if(!best?.geometry?.coordinates?.length)throw Error('No route');
   if(!(best.geometry.coordinates as Coord[]).every(inCountry)){Alert.alert('Рута','Пресметаната рута излегува надвор од Македонија.');return;}
   setRoute({type:'Feature',properties:{},geometry:best.geometry});
   const steps:string[]=(best.legs||[]).flatMap((leg:any)=>(leg.steps||[]).map((step:any)=>{const m=step.maneuver||{};return [m.modifier||m.type||'Continue',step.name?'onto '+step.name:'',Math.round(step.distance)+' meters'].filter(Boolean).join(' ');}));
   setInstructions(steps);
   setRouteInfo((best.distance/1000).toFixed(1)+' km · '+Math.round(best.duration/60)+' мин (приближно)');
   const a=origin,b=selected.coord;
   camera.current?.fitBounds([Math.max(a[0],b[0]),Math.max(a[1],b[1])],[Math.min(a[0],b[0]),Math.min(a[1],b[1])],70,700);
  }catch{Alert.alert('Рута','Routing серверот не е достапен.');}
  finally{setBusy(false);}
 }
 async function startNavigation(){
  if(!selected)return;
  const [lon,lat]=selected.coord;
  const url='https://www.google.com/maps/dir/?api=1&destination='+lat+','+lon+'&travelmode=driving&dir_action=navigate';
  try{await Linking.openURL(url);}catch{Alert.alert('Навигација','Не може да се отвори навигацијата.');}
 }
 function selectMapPoint(event:any){
  const p=event?.geometry?.coordinates;
  if(!Array.isArray(p)||p.length<2||!inCountry([p[0],p[1]]))return;
  choose({id:'point-'+p[0].toFixed(6)+'-'+p[1].toFixed(6),name:'Избрана точка',coord:[p[0],p[1]],category:'Точка на мапата'});
 }
 async function openGoogleCategory(){
  if(!categories.includes(active as Category)){Alert.alert('Google Maps','Прво избери категорија.');return;}
  const terms:Record<Category,string>={'Ресторани':'restaurants','Продавници':'shops','Бензински':'gas stations','Аптеки':'pharmacies','Болници':'hospitals','Кафулиња':'cafes','Банкомати':'ATMs'};
  const c=mapCenter.current;
  const url='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(terms[active as Category]+' near '+c[1]+','+c[0]);
  try{await Linking.openURL(url);}catch{Alert.alert('Google Maps','Не може да се отвори пребарувањето.');}
 }
 const points=useMemo(()=>featureCollection(places),[places]);
 return <SafeAreaView style={[styles.root,{backgroundColor:bg}]}>
  <StatusBar barStyle={dark?'light-content':'dark-content'}/>
  <View style={[styles.header,{backgroundColor:bg}]}>
   <Text style={[styles.title,{color:fg}]}>🇲🇰 MK SPOTS</Text>
   <View style={styles.searchRow}>
    <TextInput value={query} onChangeText={setQuery} onSubmitEditing={searchText} returnKeyType="search" placeholder="Пребарај место или адреса" placeholderTextColor="#8993a3" style={[styles.search,{color:fg,backgroundColor:dark?'#253247':'#e8edf4'}]}/>
    <TouchableOpacity onPress={searchText} disabled={busy} style={styles.searchButton}><Text style={styles.white}>⌕</Text></TouchableOpacity>
   </View>
   {cityMatches.length>0&&<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cityRow}>{cityMatches.map(c=><TouchableOpacity key={c.name} style={styles.city} onPress={()=>choose({id:c.name,name:c.name,coord:[c.coords[0],c.coords[1]],category:'Град'})}><Text style={{color:fg}}>📍 {c.name}</Text></TouchableOpacity>)}</ScrollView>}
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
    {categories.map(c=><TouchableOpacity key={c} disabled={busy} onPress={()=>loadCategory(c)} style={[styles.chip,{backgroundColor:active===c?'#2563eb':dark?'#253247':'#e8edf4'}]}><Text style={{color:active===c?'white':fg}}>{c}</Text></TouchableOpacity>)}
   </ScrollView>
  </View>
  <View style={styles.mapWrap}>
   <MapLibreGL.MapView key={dark?'dark':'light'} style={styles.map} mapStyle={dark?DARK_STYLE:LIGHT_STYLE} attributionEnabled onPress={selectMapPoint} onDidFinishLoadingMap={()=>setReady(true)} onRegionDidChange={(e:any)=>{const c=e?.geometry?.coordinates;if(Array.isArray(c)&&c.length===2)mapCenter.current=[c[0],c[1]];}}>
    <MapLibreGL.Camera ref={camera} defaultSettings={{centerCoordinate:CENTER,zoomLevel:7.2,pitch:0}} maxBounds={CAMERA_BOUNDS} minZoomLevel={6.5} maxZoomLevel={19}/>
    {showBuildings&&<MapLibreGL.VectorSource id="buildings-source" url="https://tiles.openfreemap.org/planet"><MapLibreGL.FillExtrusionLayer id="buildings-3d" sourceLayerID="building" minZoomLevel={14} style={{fillExtrusionColor:dark?"#70839a":"#aab5c3",fillExtrusionHeight:["coalesce",["get","render_height"],["get","height"],12] as any,fillExtrusionBase:["coalesce",["get","render_min_height"],0] as any,fillExtrusionOpacity:tilted?0.85:0.32}}/></MapLibreGL.VectorSource>}
    <MapLibreGL.ShapeSource id="country-mask" shape={mask as any}><MapLibreGL.FillLayer id="mask-fill" style={{fillColor:bg,fillOpacity:1}}/></MapLibreGL.ShapeSource>
    <MapLibreGL.ShapeSource id="places" shape={points} onPress={(event:any)=>{const id=event?.features?.[0]?.properties?.id;const p=places.find(x=>x.id===id);if(p)choose(p);}}>
     <MapLibreGL.CircleLayer id="places-dots" style={{circleColor:'#2563eb',circleRadius:7,circleStrokeWidth:2,circleStrokeColor:'#ffffff'}}/>
    </MapLibreGL.ShapeSource>
    {route&&<MapLibreGL.ShapeSource id="route" shape={route}><MapLibreGL.LineLayer id="route-line" style={{lineColor:'#267bff',lineWidth:6}}/></MapLibreGL.ShapeSource>}
    {origin&&<MapLibreGL.PointAnnotation id="gps-position" coordinate={origin}/>}
    {selected&&<MapLibreGL.PointAnnotation id="selected-place" coordinate={selected.coord}/>}
   </MapLibreGL.MapView>
   {!ready&&<View style={[styles.loading,{backgroundColor:bg}]}><ActivityIndicator/><Text style={{color:fg}}>Се вчитува мапата…</Text></View>}
   <View style={styles.mapButtons}>
    <TouchableOpacity onPress={()=>{setTilted(!tilted);camera.current?.setCamera({pitch:tilted?0:55,animationDuration:450});}} style={[styles.floating,{backgroundColor:bg}]}><Text style={{color:fg,fontWeight:'700'}}>{tilted?'2D':'3D 🏢'}</Text></TouchableOpacity>
    <TouchableOpacity onPress={locate} style={[styles.floating,{backgroundColor:bg}]}><Text style={{color:fg}}>◎ GPS</Text></TouchableOpacity>
    <TouchableOpacity onPress={()=>setShowBuildings(v=>!v)} style={[styles.floating,{backgroundColor:bg}]}><Text style={{color:fg}}>⌂ {showBuildings?'Згради':'Вклучи згради'}</Text></TouchableOpacity>
    <TouchableOpacity onPress={()=>setShowFavorites(!showFavorites)} style={[styles.floating,{backgroundColor:bg}]}><Text style={{color:fg}}>☆ {favorites.length}</Text></TouchableOpacity>
   </View>
   <View style={[styles.bottomPanel,{backgroundColor:bg}]}>
    {busy&&<ActivityIndicator/>}
    {categories.includes(active as Category)&&<TouchableOpacity onPress={openGoogleCategory} style={styles.primary}><Text style={styles.white}>🔎 {active} во Google Maps</Text></TouchableOpacity>}
    {showFavorites&&<ScrollView style={{maxHeight:110}}>{favorites.length?favorites.map(p=><TouchableOpacity key={p.id} onPress={()=>{choose(p);setShowFavorites(false);}} style={{padding:7}}><Text style={{color:fg}}>★ {p.name}</Text></TouchableOpacity>):<Text style={{color:fg}}>Нема зачувани места.</Text>}</ScrollView>}
    {selected?<><Text style={[styles.placeTitle,{color:fg}]} numberOfLines={2}>{selected.name}</Text><Text style={{color:dark?'#bdc9d8':'#526072'}} numberOfLines={2}>{selected.address||selected.category}</Text><View style={{flexDirection:"row",gap:8}}><TouchableOpacity onPress={toggleFavorite} style={[styles.primary,{flex:1}]}><Text style={styles.white}>{favorites.some(p=>p.id===selected.id)?"★ Зачувано":"☆ Зачувај"}</Text></TouchableOpacity><TouchableOpacity onPress={startNavigation} style={[styles.primary,{flex:2}]}><Text style={styles.white}>➜ Навигација</Text></TouchableOpacity></View><TouchableOpacity onPress={routeTo} disabled={busy} style={styles.primary}><Text style={styles.white}>Преглед на рута во MK SPOTS</Text></TouchableOpacity></>:<Text style={{color:fg,textAlign:'center'}}>{places.length?places.length+' места · допри точка на мапата':'Допрете на мапата за цел или пребарајте место'}</Text>}
    {!!routeInfo&&<Text style={{color:fg,textAlign:'center'}}>{routeInfo}</Text>}
    {instructions.length>0&&<TouchableOpacity onPress={speakRoute} style={styles.primary}><Text style={styles.white}>🔊 Прочитај ги насоките (English)</Text></TouchableOpacity>}
    <Text style={{color:dark?'#aeb8c7':'#66758b',fontSize:10,textAlign:'center'}}>© OpenStreetMap contributors · Гласовен преглед на рута, не live навигација</Text>
   </View>
  </View>
 </SafeAreaView>;
}
const styles=StyleSheet.create({
 root:{flex:1},header:{padding:12,gap:10,zIndex:5},title:{fontSize:21,fontWeight:'800'},searchRow:{flexDirection:'row',gap:8},
 search:{flex:1,borderRadius:14,paddingHorizontal:14,height:48},searchButton:{backgroundColor:'#2563eb',borderRadius:14,width:52,alignItems:'center',justifyContent:'center'},
 white:{color:'white',fontWeight:'700',fontSize:17},cityRow:{gap:8},city:{padding:8,borderRadius:10},chips:{gap:8,paddingBottom:2},
 chip:{paddingHorizontal:14,paddingVertical:11,borderRadius:24},mapWrap:{flex:1},map:{flex:1},
 loading:{...StyleSheet.absoluteFillObject,alignItems:'center',justifyContent:'center',gap:10},
 mapButtons:{position:'absolute',right:12,top:16,gap:10},floating:{borderRadius:14,padding:13,elevation:3,alignItems:'center'},
 bottomPanel:{position:'absolute',bottom:12,left:12,right:12,borderRadius:18,padding:14,gap:9,elevation:4},
 placeTitle:{fontSize:18,fontWeight:'700'},primary:{backgroundColor:'#2563eb',borderRadius:12,padding:13,alignItems:'center'}
});
