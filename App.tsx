import React, {useMemo, useState} from 'react';
import {ActivityIndicator, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, useColorScheme, View} from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import boundary from './src/data/macedonia-boundary.json';
import {createOutsideMask} from './src/services/geometry';
import {CENTER, CAMERA_BOUNDS, DEMO_STYLE} from './src/config/map';
export default function App() {
 const dark = useColorScheme() === 'dark';
 const bg = dark ? '#111827' : '#f4f7fa'; const fg = dark ? '#fff' : '#111827';
 const [query,setQuery] = useState(''); const [ready,setReady] = useState(false);
 const mask = useMemo(()=>createOutsideMask(boundary as any),[]);
 const hasBoundary = boundary.features.length > 0;
 return <SafeAreaView style={[styles.root,{backgroundColor:bg}]}>
  <StatusBar barStyle={dark?'light-content':'dark-content'}/>
  <View style={[styles.header,{backgroundColor:bg}]}><Text style={[styles.title,{color:fg}]}>🇲🇰 MK SPOTS</Text><TextInput value={query} onChangeText={setQuery} placeholder="Пребарај место во Македонија" placeholderTextColor="#8993a3" style={[styles.search,{color:fg,backgroundColor:dark?'#1f2937':'#e5e7eb'}]}/></View>
  {hasBoundary ? <View style={styles.mapWrap}>
   <MapLibreGL.MapView style={styles.map} mapStyle={DEMO_STYLE} onDidFinishLoadingMap={()=>setReady(true)}>
    <MapLibreGL.Camera defaultSettings={{centerCoordinate:CENTER,zoomLevel:7.2}} maxBounds={CAMERA_BOUNDS} minZoomLevel={6.5} maxZoomLevel={18}/>
    <MapLibreGL.ShapeSource id="outside-country" shape={mask as any}><MapLibreGL.FillLayer id="outside-fill" style={{fillColor:bg,fillOpacity:1}}/></MapLibreGL.ShapeSource>
   </MapLibreGL.MapView>
   {!ready && <View style={[styles.loading,{backgroundColor:bg}]}><ActivityIndicator/><Text style={{color:fg}}>Се вчитува мапата…</Text></View>}
   <View style={[styles.note,{backgroundColor:bg}]}><Text style={{color:fg}}>Демо мапа · Само Македонија</Text></View>
  </View> : <View style={styles.loading}><Text style={{color:fg}}>Недостасува граница — изврши npm run fetch:boundary</Text></View>}
  <View style={[styles.footer,{backgroundColor:bg}]}><Text style={{color:fg}}>🗺️ Мапа</Text><Text style={{color:fg}}>GPS · Offline · 3D наскоро</Text></View>
 </SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1},header:{padding:16,gap:10},title:{fontSize:20,fontWeight:'800'},search:{borderRadius:12,padding:12},mapWrap:{flex:1},map:{flex:1},loading:{...StyleSheet.absoluteFillObject,alignItems:'center',justifyContent:'center',padding:20},note:{position:'absolute',bottom:16,alignSelf:'center',padding:10,borderRadius:10},footer:{padding:16,flexDirection:'row',justifyContent:'space-between'}});
