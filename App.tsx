import React, {useMemo, useRef, useState} from 'react';
import {ActivityIndicator, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, View} from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import boundary from './src/data/macedonia-boundary.json';
import {createOutsideMask} from './src/services/geometry';
import {CENTER, CAMERA_BOUNDS, LIGHT_STYLE, DARK_STYLE, CITIES} from './src/config/map';

export default function App() {
 const dark = useColorScheme() === 'dark';
 const bg = dark ? '#101827' : '#f4f7fa'; const fg = dark ? '#fff' : '#111827';
 const [query,setQuery] = useState(''); const [ready,setReady] = useState(false);
 const camera = useRef<any>(null);
 const mask = useMemo(()=>createOutsideMask(boundary as any),[]);
 const hasBoundary = boundary.features.length > 0;
 const results = query.trim().length > 1 ? CITIES.filter(c=>(c.name+' '+c.aliases).toLowerCase().includes(query.trim().toLowerCase())).slice(0,6) : [];
 function chooseCity(city: typeof CITIES[number]) {
  setQuery(city.name);
  camera.current?.setCamera({centerCoordinate:[...city.coords],zoomLevel:12,animationDuration:800});
 }
 return <SafeAreaView style={[styles.root,{backgroundColor:bg}]}>
  <StatusBar barStyle={dark?'light-content':'dark-content'}/>
  <View style={[styles.header,{backgroundColor:bg}]}>
   <Text style={[styles.title,{color:fg}]}>🇲🇰 MK SPOTS</Text>
   <TextInput value={query} onChangeText={setQuery} placeholder="Пребарај град во Македонија" placeholderTextColor="#8993a3" style={[styles.search,{color:fg,backgroundColor:dark?'#1f2937':'#e5e7eb'}]}/>
   {results.length>0 && <View style={[styles.results,{backgroundColor:dark?'#1f2937':'#fff'}]}>{results.map(city=><TouchableOpacity key={city.name} onPress={()=>chooseCity(city)} style={styles.result}><Text style={{color:fg}}>📍 {city.name}</Text></TouchableOpacity>)}</View>}
  </View>
  {hasBoundary ? <View style={styles.mapWrap}>
   <MapLibreGL.MapView key={dark?'dark':'light'} style={styles.map} mapStyle={dark?DARK_STYLE:LIGHT_STYLE} onDidFinishLoadingMap={()=>setReady(true)} attributionEnabled={true}>
    <MapLibreGL.Camera ref={camera} defaultSettings={{centerCoordinate:CENTER,zoomLevel:7.2}} maxBounds={CAMERA_BOUNDS} minZoomLevel={6.5} maxZoomLevel={19}/>
    <MapLibreGL.ShapeSource id="outside-country" shape={mask as any}><MapLibreGL.FillLayer id="outside-fill" style={{fillColor:bg,fillOpacity:1}}/></MapLibreGL.ShapeSource>
   </MapLibreGL.MapView>
   {!ready && <View style={[styles.loading,{backgroundColor:bg}]}><ActivityIndicator/><Text style={{color:fg}}>Се вчитува мапата…</Text></View>}
   <View style={[styles.note,{backgroundColor:bg}]}><Text style={{color:fg}}>Македонија · Улици и населени места</Text></View>
  </View> : <View style={styles.loading}><Text style={{color:fg}}>Недостасува граница — изврши npm run fetch:boundary</Text></View>}
  <View style={[styles.footer,{backgroundColor:bg}]}><Text style={{color:fg}}>🗺️ Мапа</Text><Text style={{color:fg}}>GPS · Offline · 3D наскоро</Text></View>
 </SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1},header:{padding:16,gap:10,zIndex:5},title:{fontSize:20,fontWeight:'800'},search:{borderRadius:12,padding:12},results:{position:'absolute',top:110,left:16,right:16,borderRadius:12,elevation:8,zIndex:10},result:{padding:14,borderBottomWidth:0.5,borderBottomColor:'#8885'},mapWrap:{flex:1},map:{flex:1},loading:{...StyleSheet.absoluteFillObject,alignItems:'center',justifyContent:'center',padding:20},note:{position:'absolute',bottom:16,alignSelf:'center',padding:10,borderRadius:10},footer:{padding:16,flexDirection:'row',justifyContent:'space-between'}});
