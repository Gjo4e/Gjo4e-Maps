import React, {useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Alert, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, View} from 'react-native';
import * as Location from 'expo-location';
import MapLibreGL from '@maplibre/maplibre-react-native';
import boundary from './src/data/macedonia-boundary.json';
import {createOutsideMask} from './src/services/geometry';
import {CENTER, CAMERA_BOUNDS, LIGHT_STYLE, DARK_STYLE, CITIES} from './src/config/map';

type Coord = [number,number];
const withinBounds = (p: Coord) => p[0]>=20.35 && p[0]<=23.15 && p[1]>=40.8 && p[1]<=42.45;
export default function App() {
 const dark=useColorScheme()==='dark', bg=dark?'#101827':'#f4f7fa', fg=dark?'#fff':'#111827';
 const [query,setQuery]=useState(''), [ready,setReady]=useState(false);
 const [origin,setOrigin]=useState<Coord|null>(null),[destination,setDestination]=useState<Coord|null>(null);
 const [route,setRoute]=useState<any>(null),[routeInfo,setRouteInfo]=useState(''),[busy,setBusy]=useState(false);
 const camera=useRef<any>(null);
 const mask=useMemo(()=>createOutsideMask(boundary as any),[]);
 const results=query.trim().length>1?CITIES.filter(c=>(c.name+' '+c.aliases).toLowerCase().includes(query.trim().toLowerCase())).slice(0,6):[];
 function chooseCity(city:typeof CITIES[number]){
  const p:Coord=[city.coords[0],city.coords[1]];
  setQuery(city.name);setDestination(p);setRoute(null);setRouteInfo('');
  camera.current?.setCamera({centerCoordinate:p,zoomLevel:12,animationDuration:800});
 }
 async function locate(){
  try{
   setBusy(true);
   const permission=await Location.requestForegroundPermissionsAsync();
   if(permission.status!=='granted'){Alert.alert('GPS','Потребна е дозвола за локација.');return;}
   const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
   const p:Coord=[pos.coords.longitude,pos.coords.latitude];
   if(!withinBounds(p)){Alert.alert('Локација','GPS позицијата е надвор од поддржаната област.');return;}
   setOrigin(p);camera.current?.setCamera({centerCoordinate:p,zoomLevel:14,animationDuration:700});
  }catch(e){Alert.alert('GPS грешка','Не можам да ја добијам локацијата.');}
  finally{setBusy(false);}
 }
 async function calculateRoute(){
  if(!origin||!destination){Alert.alert('Рута','Прво притисни GPS и избери град од пребарувањето.');return;}
  setBusy(true);
  try{
   // OSRM demo is for testing only, not a production routing service.
   const url='https://router.project-osrm.org/route/v1/driving/'+origin.join(',')+';'+destination.join(',')+'?overview=full&geometries=geojson';
   const response=await fetch(url);
   if(!response.ok)throw new Error('Routing HTTP '+response.status);
   const json=await response.json(), best=json.routes?.[0];
   if(!best?.geometry?.coordinates?.length)throw new Error('No route');
   const coordinates=best.geometry.coordinates as Coord[];
   if(coordinates.some(p=>!withinBounds(p))){Alert.alert('Рута','Рутата излегува надвор од Македонија и не може да се прикаже.');return;}
   setRoute({type:'Feature',properties:{},geometry:best.geometry});
   setRouteInfo((best.distance/1000).toFixed(1)+' km · '+Math.round(best.duration/60)+' мин (проценка)');
   camera.current?.fitBounds([Math.max(origin[0],destination[0]),Math.max(origin[1],destination[1])],[Math.min(origin[0],destination[0]),Math.min(origin[1],destination[1])],70,800);
  }catch(e){Alert.alert('Рута недостапна','Пробната routing услуга не врати рута. Обиди се повторно.');}
  finally{setBusy(false);}
 }
 return <SafeAreaView style={[styles.root,{backgroundColor:bg}]}>
  <StatusBar barStyle={dark?'light-content':'dark-content'}/>
  <View style={[styles.header,{backgroundColor:bg}]}>
   <Text style={[styles.title,{color:fg}]}>🇲🇰 MK SPOTS</Text>
   <TextInput value={query} onChangeText={setQuery} placeholder="Пребарај град во Македонија" placeholderTextColor="#8993a3" style={[styles.search,{color:fg,backgroundColor:dark?'#1f2937':'#e5e7eb'}]}/>
   {results.length>0&&<View style={[styles.results,{backgroundColor:dark?'#1f2937':'#fff'}]}>{results.map(city=><TouchableOpacity key={city.name} onPress={()=>chooseCity(city)} style={styles.result}><Text style={{color:fg}}>📍 {city.name}</Text></TouchableOpacity>)}</View>}
  </View>
  <View style={styles.mapWrap}>
   <MapLibreGL.MapView key={dark?'dark':'light'} style={styles.map} mapStyle={dark?DARK_STYLE:LIGHT_STYLE} onDidFinishLoadingMap={()=>setReady(true)} attributionEnabled={true}>
    <MapLibreGL.Camera ref={camera} defaultSettings={{centerCoordinate:CENTER,zoomLevel:7.2}} maxBounds={CAMERA_BOUNDS} minZoomLevel={6.5} maxZoomLevel={19}/>
    <MapLibreGL.ShapeSource id="outside-country" shape={mask as any}><MapLibreGL.FillLayer id="outside-fill" style={{fillColor:bg,fillOpacity:1}}/></MapLibreGL.ShapeSource>
    {route&&<MapLibreGL.ShapeSource id="route" shape={route}><MapLibreGL.LineLayer id="route-line" style={{lineColor:'#2979ff',lineWidth:5,lineOpacity:0.9}}/></MapLibreGL.ShapeSource>}
    {origin&&<MapLibreGL.PointAnnotation id="my-position" coordinate={origin}/>}
    {destination&&<MapLibreGL.PointAnnotation id="destination" coordinate={destination}/>}
   </MapLibreGL.MapView>
   {!ready&&<View style={[styles.loading,{backgroundColor:bg}]}><ActivityIndicator/><Text style={{color:fg}}>Се вчитува мапата…</Text></View>}
   <View style={[styles.controls,{backgroundColor:bg}]}>
    <TouchableOpacity disabled={busy} onPress={locate} style={styles.button}><Text style={styles.buttonText}>◎ Моја локација</Text></TouchableOpacity>
    <TouchableOpacity disabled={busy} onPress={calculateRoute} style={styles.button}><Text style={styles.buttonText}>➜ Пресметај рута</Text></TouchableOpacity>
    {!!routeInfo&&<Text style={{color:fg,textAlign:'center'}}>{routeInfo}</Text>}
    <Text style={{color:fg,fontSize:11,textAlign:'center'}}>Пробни рути · не користи за возење во реално време</Text>
   </View>
  </View>
  <View style={[styles.footer,{backgroundColor:bg}]}><Text style={{color:fg}}>🗺️ Мапа</Text><Text style={{color:fg}}>Offline · 3D наскоро</Text></View>
 </SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1},header:{padding:16,gap:10,zIndex:5},title:{fontSize:20,fontWeight:'800'},search:{borderRadius:12,padding:12},results:{position:'absolute',top:110,left:16,right:16,borderRadius:12,elevation:8,zIndex:10},result:{padding:14,borderBottomWidth:0.5,borderBottomColor:'#8885'},mapWrap:{flex:1},map:{flex:1},loading:{...StyleSheet.absoluteFillObject,alignItems:'center',justifyContent:'center',padding:20},controls:{position:'absolute',bottom:12,left:12,right:12,borderRadius:14,padding:10,gap:8},button:{backgroundColor:'#2563eb',padding:12,borderRadius:10,alignItems:'center'},buttonText:{color:'white',fontWeight:'700'},footer:{padding:16,flexDirection:'row',justifyContent:'space-between'}});
