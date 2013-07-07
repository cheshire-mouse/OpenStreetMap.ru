// busmap scripts
// author: gryphon
// license: WTFPL v.2

osm.busmap={

map:null,
routes:new Array(),
busstops:new Array(),
xmlhttp:null,
activeRoute:null,
activeBusstop:null,
busstopsAllowed:true,
openedPopupLatLng:null,
openedPopupType:null,
autoRefresh:false,

visibleCount:0,

defaultRouteStyle:{opacity:0.5,weight:5},
activeRouteStyle:{opacity:1,weight:10},
defaultBusstopStyle:{opacity:0.5,fillOpacity:0.2,color:"blue",fillColor:"blue"},
activeBusstopStyle:{opacity:1,fillOpacity:1,color:"blue",fillColor:"orange"},

cancelNextMapMoveEvent:false,

layerRoutes:null,
layerBusstops:null,

mapRoutes:new Object(),
mapBusstops:new Object(),

enabled:false,

transportIcons:{
	bus:"img/bus.png",
	trolleybus:"img/trolleybus.png",
	tram:"img/tram.png"
},

initBusmap:function (){
	this.map = osm.map; 
	var me=this;

	this.layerRoutes=new L.GeoJSON([],{
		onEachFeature: function(data,layer){me.onEachRouteFeature(data,layer)} //stupid js
	});
	this.layerBusstops=new L.GeoJSON([],{
		pointToLayer: function(data,latlng){
			return L.circleMarker(latlng,me.defaultBusstopStyle);
		},
		onEachFeature: function(data,layer){me.onEachBusstopFeature(data,layer)}
	});

	this.busstopsAllowed=document.getElementById("bus-checkbox-allowstops").checked;
	document.addEventListener("routesupdateend",this.docOnRoutesUpdateEnd);
	this.map.on('popupclose',this.mapOnPopupClose);

},

destroyBusmap:function (){
	this.removeActiveRouteBusstopsLayers();
	this.layerRoutes.clearLayers();
	this.layerBusstops.clearLayers();
	var td=document.getElementById("bus-list");
	while (td.firstChild) td.removeChild(td.firstChild);
	document.getElementById("bus-checkbox-allowstops").checked=false;
	document.getElementById("bus-checkbox-autorefresh").checked=false;
	this.enableButtons();

	document.removeEventListener("routesupdateend",this.docOnRoutesUpdateEnd);
	this.map.off('popupclose',this.mapOnPopupClose);
	
	this.map=null;
	this.routes=new Array();
	this.busstops=new Array();
	this.xmlhttp=null;
	this.activeRoute=null;
	this.activeBusstop=null;
	this.busstopsAllowed=true;
	this.openedPopupLatLng=null;
	this.openedPopupType=null;
	this.autoRefresh=false;

	this.visibleCount=0;

	this.cancelNextMapMoveEvent=false;

	this.layerRoutes=null;
	this.layerBusstops=null;

	this.mapRoutes=new Object();
	this.mapBusstops=new Object();

},


getRoutePopupHTML:function (route,withBusstops){
	var fields=new Array();
	fields.push({id:"ref",name:"Номер"});
	fields.push({id:"from",name:"Откуда"});
	fields.push({id:"to",name:"Куда"});
	//fields.push({id:"route",name:"Тип"});
	fields.push({id:"operator",name:"Владелец"});
	var description="";
	var iconTag="<img src='"+this.transportIcons[route["route"]]+"' />";
	if (route.name!=null) description +="<h3>"+iconTag+" "+route.name+"</h3>";
	description+="<table>";
	for (var i in fields){
		if (route[fields[i].id]!=null) 
			description +="<tr><td>"+fields[i].name+
				"</td><td>"+route[fields[i].id]+"</td></tr>";
	}
	description+="</table>";
	if (withBusstops){
		description+="<div style=max-height:150px;overflow:auto>";
		for (var i in route.stops){
			if (i>0) description+="<br>";
			var stop_id=route.stops[i].osm_id;
			description+="<a onclick=osm.busmap.popupBusstopOnClick(event) value="+stop_id+">";
			description+=(route.stops[i].name!=null)?(route.stops[i].name):("-???-");
			description+="</a>";
		}
		description+="</div>";
	}
	return description;
},

getBusstopPopupHTML:function (stop,withRoutes){
	var descr="";
	if (stop.name!=null)
		descr="<h3>"+stop.name+"</h3>";
	if (withRoutes){
		descr+="<div style=max-height:200px;overflow:auto>";
		for ( var i in stop.routes){
			var route_id=stop.routes[i].osm_id;
			var checked=stop.routes[i].isVisible?("checked"):("");
			if (i>0) descr+="<br>";
			descr+="<input type=checkbox "+checked+
					" id=popup_route_"+route_id+
					" value="+route_id+
					" onchange=osm.busmap.chkPopupOnChange(event) "+">"+
					"<span style=color:"+stop.routes[i].color+">\u2588 </span>";
			descr+="<a onclick=osm.busmap.popupRouteOnClick(event) value="+route_id+">";
			descr+=stop.routes[i].name;
			descr+="</a>";
		}
		descr+="</div>"
	}
	return descr;
},

getRouteName:function (route){
	var name="";
	if (route.name!=null) return route.name;
	if (route.ref!=null) name=route.ref;
	if (route.from!=null && route.to!=null){
		if (name!="") name+=" ";
		name+=route.from+" - "+route.to;
	}
	return name;
},

generateColorFromRef:function (ref){
	var color;
	num=parseInt(ref,10);
	if ( isNaN(num) || num < 1 ) 
		return null;
	else {
		//i can't say for sure what this formula does 
		//so don't use it if you do not.... just don't use it at all
		p=3; //magic number, do not use 2^n
		b=Math.pow( p, Math.floor( Math.log(num) / Math.log(p) ) + 1 );
		var astart=1;
		var aend=num-b/p+1;
		for (a=astart; a<=aend;a++)
			if (a/p==Math.floor(a/p)) aend++;
		a--;
		color="#"+this.pad( Math.floor(1.0*a/b*0xffffff).toString(16) , 6 );
	}
	return color;
},

processJSON:function (){
	if (!this.enabled || this.xmlhttp==null) return;

	if (this.xmlhttp.readyState != 4) return;
	if (this.xmlhttp.status != 200){
		alert(this.xmlhttp.status+" "+this.xmlhttp.statusText);
		enableButtons();
		return;
	}
	var routesJson=JSON.parse(this.xmlhttp.responseText);

	var allVisible=false;
	allVisible=(this.visibleCount==this.routes.length);
	var mapVisibleRoutes=new Object();
	if (!allVisible)
		for (var i in routes)
			if (routes[i].isVisible) mapVisibleRoutes[routes[i].osm_id]=true;
	this.visibleCount=0;
	this.removeActiveRouteBusstopsLayers();
	this.layerRoutes.clearLayers();
	this.layerBusstops.clearLayers();

	this.busstops=routesJson["busstops"];
	this.mapBusstops=new Object();
	var busstops=this.busstops;
	var mapBusstops=this.mapBusstops;

	var activeBusstopFound=false;
	for (var i in busstops){
		mapBusstops[busstops[i].osm_id]=busstops[i];
		busstops[i].routes=new Array();
		busstops[i].visibleRoutes=0;
		busstops[i].point.properties=new Object();
		busstops[i].point.properties.osm_id=busstops[i].osm_id;
		if (this.activeBusstop!=null && busstops[i].osm_id==this.activeBusstop.osm_id){
			this.activeBusstop=busstops[i];
			activeBusstopFound=true;
		}
	}
	if (!activeBusstopFound) this.activeBusstop=null;

	this.routes=routesJson["routes"];
	this.mapRoutes=new Object();
	var routes=this.routes;
	var mapRoutes=this.mapRoutes;

	var newActiveRoute=null;
	for ( var i in routes ) {
		routes[i].name=this.getRouteName(routes[i]);
		if (routes[i].color==null)  routes[i].color=this.generateColorFromRef(routes[i].ref);
		if (routes[i].color==null)  routes[i].color=this.generateColorFromRef(routes[i].osm_id);
		if (allVisible || mapVisibleRoutes[routes[i].osm_id]==true)
			routes[i].isVisible=true;
		routes[i].stops=new Array();
		var stops_ids=routes[i].stops_ids;
		for (var s in stops_ids){
			var s_id=stops_ids[s];
			var stop=mapBusstops[s_id];
			routes[i].stops.push(stop);
			stop.routes.push(routes[i]);
		}
		routes[i].popupContent=this.getRoutePopupHTML(routes[i],true);
		//console.debug(routes[i].name);
		routes[i].lines.coordinates=this.mergeLines(routes[i].lines.coordinates);
		routes[i].lines.properties=new Object();
		routes[i].lines.properties.color=routes[i].color;
		routes[i].lines.properties.osm_id=routes[i].osm_id;
		mapRoutes[routes[i].osm_id]=routes[i];
		if (this.activeRoute!=null && routes[i].osm_id==this.activeRoute.osm_id)
			newActiveRoute=routes[i];
	}
	routes.sort(this.compareRoutes);
	for (var i in busstops)
		busstops[i].popupContent=this.getBusstopPopupHTML(busstops[i],true);
	for (var i in routes)
		this.addRouteToLayer(routes[i]);
	this.addLayers();
	if (this.busstopsAllowed) layerBusstops.bringToFront();
	this.activeRoute=null;
	if (newActiveRoute!=null) this.activateRoute(newActiveRoute,null);
	this.createCheckboxes();
	this.enableButtons();
	this.xmlhttp=null;
	var evn=new CustomEvent("routesupdateend");
	document.dispatchEvent(evn);
	$("#leftbusmap .loader").removeClass('on');
},

requestRoutes:function () {
	var me=this;
	var bbox=new Object();
	bbox.N=this.map.getBounds().getNorthEast().lat;
	bbox.E=(this.map.getBounds()).getNorthEast().lng;
	bbox.S=this.map.getBounds().getSouthWest().lat;
	bbox.W=this.map.getBounds().getSouthWest().lng;
	if (window.XMLHttpRequest) {
   		this.xmlhttp=new XMLHttpRequest();
	   }
 	else {
		return;
	}
	var json_url='http://198.199.107.98/routes.py/getroutes?'+
	//json_url='http://postgis/routes.py/getroutes?'+
		'bboxe='+bbox.E+'&bboxw='+bbox.W+'&bboxn='+bbox.N+'&bboxs='+bbox.S;
	this.xmlhttp.open("GET",json_url,true);
	this.xmlhttp.onreadystatechange=function(){me.processJSON()}; //stupid js
	this.xmlhttp.send();
	this.disableButtons();
	$("#leftbusmap .loader").addClass('on');
},

createCheckboxes:function (){
	var routes=this.routes;
	var me=this;
	var td=document.getElementById("bus-list");
	while (td.firstChild) td.removeChild(td.firstChild);
	
	for (var i in routes){
		var checkbox= document.createElement("input");
		checkbox.type="checkbox";
		checkbox.id="route_"+routes[i].osm_id;
		checkbox.value=routes[i].osm_id;
		if (routes[i].isVisible) checkbox.checked=true;
		checkbox.addEventListener("change",function(e){me.checkOnChange(e)});
		var span=document.createElement("span");
		span.style.color=routes[i].color;
		colorMarker=document.createTextNode("\u2588 ");
		var href=document.createElement("a");
		href.textContent=routes[i].name;
		href.addEventListener("click",function(e){me.listRouteOnClick(e)});
		href.value=routes[i].osm_id;
		var br=document.createElement('br');
		span.appendChild(colorMarker);
		td.appendChild(checkbox);
		td.appendChild(span);
		td.appendChild(href);
		td.appendChild(br);
	}
},

onEachRouteFeature:function (data,layer){
	var me=this;
	layer.setStyle({color:data.properties.color});
	var route=this.mapRoutes[data.properties.osm_id];
	layer.on('click',function(e){me.routeOnClick(e)});
	layer.on('contextmenu',function(e){me.routeOnContextmenu(e)});
	route.layer=layer;
	layer.bindLabel(route.name);
},

onEachBusstopFeature:function (data,layer){
	var me=this;
	var busstop=this.mapBusstops[data.properties.osm_id];
	layer.on('click',function(e){me.busstopOnClick(e)});
	layer.on('contextmenu',function(e){me.busstopOnClick(e)});
	busstop.layer=layer;
	layer.bindLabel(busstop.name,{noHide:true});
},

addLayers:function (){
	this.map.addLayer(this.layerRoutes);
	if (this.busstopsAllowed) this.map.addLayer(this.layerBusstops);
},

disableButtons:function (){
	document.getElementById("bus-button-refresh").disabled=true;
},

enableButtons:function (){
	document.getElementById("bus-button-refresh").disabled=false;
},

checkOnChange:function (e){
	var routeid=e.target.value;
	var isChecked=e.target.checked;
	var route=this.mapRoutes[routeid];
	chkPopup=document.getElementById("popup_route_"+routeid);
	if (chkPopup != null) chkPopup.checked=isChecked;
	this.setRouteVisibility(route,isChecked);
	if (isChecked) this.moveActiveRouteToFront();
},

chkPopupOnChange:function (e){
	var isChecked=e.target.checked;
	var routeid=e.target.value;
	var route=this.mapRoutes[routeid];
	document.getElementById("route_"+routeid).checked=isChecked;
	this.setRouteVisibility(route,isChecked);
	if (isChecked) this.moveActiveRouteToFront();
},

addRouteToLayer:function (route){
	this.layerRoutes.addData(route.lines);
	if (route.isVisible) this.visibleCount++;
	else this.layerRoutes.removeLayer(route.layer);
	for (var i in route.stops){
		var stop=route.stops[i];
		if (stop.visibleRoutes==0) this.layerBusstops.addData(stop.point);
		if (route.isVisible) stop.visibleRoutes++;
		if (stop.visibleRoutes==0) this.layerBusstops.removeLayer(stop.layer);
	}

},

setRouteVisibility:function (route,isVisible){
	if (route.isVisible==isVisible) return;
	route.isVisible=isVisible;
	if (isVisible){
		this.visibleCount++;
		this.layerRoutes.addLayer(route.layer);
		for (var i in route.stops){
			route.stops[i].visibleRoutes++;
			this.layerBusstops.addLayer(route.stops[i].layer);
		}
		if (this.activeRoute==route && !this.busstopsAllowed) 
			this.addActiveRouteBusstopsLayers();
	}
	else {
		this.visibleCount--;
		this.layerRoutes.removeLayer(route.layer);
		for (var i in route.stops){
			route.stops[i].visibleRoutes--;
			if (route.stops[i].visibleRoutes==0)
				this.layerBusstops.removeLayer(route.stops[i].layer);
		}
		if (this.activeRoute==route && !this.busstopsAllowed) 
			this.removeActiveRouteBusstopsLayers();
	}
},

chkAllowStopsOnChange:function (){
	var chk=document.getElementById("bus-checkbox-allowstops")
	this.busstopsAllowed=chk.checked;
	if ( this.busstopsAllowed ) {
		this.map.addLayer(this.layerBusstops);
		this.addActiveRouteBusstopsLayers();
		this.moveActiveRouteToFront();
	}
	else  {
		this.map.removeLayer(this.layerBusstops);
		this.addActiveRouteBusstopsLayers();
	}
},

checkAll:function (){
	var visible=(this.visibleCount<routes.length);
	for (var i=0; i<this.routes.length;i++){
		document.getElementById("route_"+this.routes[i].osm_id).checked=visible;
		chkPopup=document.getElementById("popup_route_"+this.routes[i].osm_id);
		if (chkPopup != null) chkPopup.checked=visible;
		this.setRouteVisibility(this.routes[i],visible);
	}
	if (visible && this.busstopsAllowed) this.layerBusstops.bringToFront();
	if (visible) this.moveActiveRouteToFront();
},

moveActiveRouteToFront:function (){
	if (this.activeRoute==null || !this.activeRoute.isVisible) return;
	this.activeRoute.layer.bringToFront();
	for (var i in this.activeRoute.stops)
		this.activeRoute.stops[i].layer.bringToFront();
},

//merge adjucent lines in the array of lines
//result is still array of lines (if there are no gaps
//it will contain only one element)
mergeLines:function (arLines){
        //console.debug("mergeLines, in: "+arLines.length);
        if (arLines.length<2) return arLines;
        var arMergedLines=new Array();
        for (var i=0;i<arLines.length-1;i++){
                ar1first=arLines[i][0];
                ar1last=arLines[i][arLines[i].length-1];
                ar2first=arLines[i+1][0];
                ar2last=arLines[i+1][arLines[i+1].length-1];
                if ( this.pairsEqual(ar1first,ar2first) ) arLines[i].reverse();
                else if ( this.pairsEqual(ar1last,ar2last) ) arLines[i+1].reverse();
                else if ( this.pairsEqual(ar1first,ar2last) ) {
                        arLines[i].reverse();
                        arLines[i+1].reverse();
                }
                ar2first=arLines[i+1][0];
                ar1last=arLines[i][arLines[i].length-1];
                if ( this.pairsEqual(ar2first,ar1last) ){
                        arLines[i].pop();
                        arLines[i+1]=arLines[i].concat(arLines[i+1]);
                }
                else arMergedLines.push(arLines[i]);
        }
        arMergedLines.push(arLines[arLines.length-1]);
        //console.debug("mergeLines, out: "+arMergedLines.length);
        return arMergedLines;
}, 

pairsEqual:function (a,b){
	return ( a[0] == b[0] && a[1] == b[1] );
},

compareRoutes:function (a,b){
	if (a.name < b.name)
		return -1;
	if (a.name > b.name)
		return 1;
	return 0;
},

compareRefs:function (a,b){
	if (parseInt(a) < parseInt(b)) return -1;
	if (parseInt(a) > parseInt(b)) return 1;
	if ( a < b ) return -1;
	if ( a > b ) return 1;
	return 0;
},

pad:function (str,num){
	var result_str="000000000000000000"+str;
	return result_str.substring(result_str.length-num,result_str.length);
},

btnRefreshOnClick:function () {
	if (this.xmlhttp==null) this.requestRoutes();
},

btnCheckAllOnClick:function () {
	this.checkAll();
},

chkAutorefreshOnChange:function (){
	var me=this;	
	var chk=document.getElementById("bus-checkbox-autorefresh");
	autoRefresh=chk.checked;
	if (chk.checked) this.map.on('moveend',function(e){me.mapOnMoveend(e)});
	else this.map.off('moveend',function(e){me.mapOnMoveend(e)});
},

activateRoute:function (route,popupCoord){
	var layer=route.layer;
	if (this.activeRoute!=null){ 
		this.setRouteStyle(this.activeRoute,false);
		this.updateBusstopsIndexes(this.activeRoute,false);
		this.removeActiveRouteBusstopsLayers();
		if (this.busstopsAllowed) this.layerBusstops.bringToFront();
	}
	if (this.activeRoute!=null && this.activeRoute.osm_id==route.osm_id)	{
		this.activeRoute=null;
		//map.closePopup();
	}
	else {
		this.activeRoute=route;
		this.setRouteStyle(route,true);
		this.addActiveRouteBusstopsLayers();
		this.updateBusstopsIndexes(route,true);
		this.moveActiveRouteToFront();
		if (popupCoord!=null) this.openPopup(popupCoord,route.popupContent,"route",true);
	}
},

updateBusstopsIndexes:function (route,withIndex){
	for (var i=route.stops.length-1;i>=0;i--){
		var index=parseInt(i)+1;
		route.stops[i].layer.unbindInnerLabel();
		if (withIndex){ 
			route.stops[i].layer.bindInnerLabel(index.toString());
			route.stops[i].layer.showInnerLabel();
		}
	}
},

addActiveRouteBusstopsLayers:function (){
	if (this.activeRoute==null) return;
	var route=this.activeRoute;
	if (this.busstopsAllowed) return;
	for (var i in route.stops) 
		this.map.addLayer(route.stops[i].layer);
},

removeActiveRouteBusstopsLayers:function (){
	if (this.activeRoute==null) return;
	var route=this.activeRoute;
	if (this.busstopsAllowed) return;
	for (var i in route.stops) 
		this.map.removeLayer(route.stops[i].layer);
},

setRouteStyle:function (route,active){
	if (route==null) return;
	var busstopStyle,routeStyle; 
	if (active){
		routeStyle=this.activeRouteStyle;
		busstopStyle=this.activeBusstopStyle;
	}
	else{
		routeStyle=this.defaultRouteStyle;
		busstopStyle=this.defaultBusstopStyle;
	}
	route.layer.setStyle(routeStyle);
	for (var i in route.stops) 
		route.stops[i].layer.setStyle(busstopStyle);
},

routeOnClick:function (e){
	var layer=e.target;
	var popupCoord=e.latlng;
	var routeid=layer.feature.properties.osm_id;
	//hideLabel doesn't work, so create new label to make it hide
	layer.unbindLabel();
	layer.bindLabel(this.mapRoutes[routeid].name);
	this.map.closePopup();
	this.activateRoute(this.mapRoutes[routeid],null);
},

routeOnContextmenu:function (e){
	var layer=e.target;
	var popupCoord=e.latlng;
	var routeid=layer.feature.properties.osm_id;
	this.openPopup(popupCoord,this.mapRoutes[routeid].popupContent,"route",true);
},

popupRouteOnClick:function (e){
	var route_ind=e.target.attributes.value.value;
	var route=this.mapRoutes[route_ind];
	var popupCoord=this.openedPopupLatLng;
	this.activateRoute(route,null);
	//if (activeRoute==null) activateRoute(route,null);
},

listRouteOnClick:function (e){
	var route_id=e.target.value;
	var route=this.mapRoutes[route_id];
	var popupCoord=route.layer.getBounds().getCenter();
	this.map.setView(popupCoord,this.map.getZoom());
	this.activateRoute(route,null);
	if (this.activeRoute==null) this.activateRoute(route,null);
},

activateBusstop:function (layer){
	var stopid=layer.feature.properties.osm_id;
	var stop=this.mapBusstops[stopid];
	this.activeBusstop=stop;
	this.openPopup(layer.getLatLng(),stop.popupContent,"busstop",true);
},

openPopup:function (latlng,popupContent,type,autoPan){
	var oldBounds=this.map.getBounds();
	this.map.closePopup();
	var popup = L.popup({autoPan:autoPan});
	this.openedPopupLatLng=latlng;
	this.openedPopupType=type;
	popup.setLatLng(latlng);
	popup.setContent(popupContent);
	this.map.openPopup(popup);
	//sync routes' checkboxes state
	if (this.openedPopupType=="busstop") 
		for (var i in this.activeBusstop.routes){
			var route=this.activeBusstop.routes[i];
			document.getElementById("popup_route_"+route.osm_id).checked=route.isVisible;	
		}
	if ( !oldBounds.equals(this.map.getBounds()) ) this.cancelNextMapMoveEvent=true; 
},

busstopOnClick:function (e){
	var layer=e.target;
	this.activateBusstop(layer);
},

popupBusstopOnClick:function (e){
	var stopid=e.target.attributes.value.value;
	var layer=this.mapBusstops[stopid].layer;
	this.map.setView(layer.getLatLng(),this.map.getZoom());
	this.activateBusstop(layer);
},

mapOnMoveend:function (e){
	if (this.cancelNextMapMoveEvent){
		this.cancelNextMapMoveEvent=false;
		return;
	}
	if (this.xmlhttp==null) this.requestRoutes();
},

mapOnPopupClose:function (e){
	this.openedPopupLatLng=null;
	this.openedPopupType=null;
},

updatePopupContent:function (){
	if (this.openedPopupType==null) return;
	var activeObject=null;
	if (this.openedPopupType=="route") activeObject=null;
	if (this.openedPopupType=="busstop") activeObject=this.activeBusstop;
	if (activeObject==null){
		this.map.closePopup();
		return;
	}
	var content=activeObject.popupContent;
	this.openPopup(this.openedPopupLatLng,content,this.openedPopupType,false);
},

docOnRoutesUpdateEnd:function (e){
	this.updatePopupContent();
},

enable:function(){
	if (this.enabled) return;
	this.initBusmap();
	this.enabled=true;
	if (this.xmlhttp==null) this.requestRoutes();
},

disable:function(){
	if (!this.enabled) return;
	this.destroyBusmap();
	this.enabled=false;
}

}; //osm.busmap
