'use strict';

/**
 * Modified by - Jacob Liscom
 */

var config ={
    topLeft:{
        lat: 33.712167,
        long:-112.271690
    },
    bottomRight:{
        lat:33.217292,
        long:-111.633453
    },
    viewStart:{
        lat:33.217292,
        long:-111.633453,
        zoom: 13
    },
    layersToLoad: 14,
    msThrottle: 100,
    databaseName:"tile"
};

 /**
 * Custom leaflet layer
 */
var StorageTileLayer = L.TileLayer.extend({
    _setUpTile: function (done, tile, value, blob) {
        if (blob) {
            //Pull from cache and add cleanup to event bindings
            value = URL.createObjectURL(value);
            tile.onload = L.bind(function (done, tile) {
                URL.revokeObjectURL(value);
                this._tileOnLoad(done, tile);
            }, this, done, tile);

            tile.onerror = L.bind(function (done, tile) {
                URL.revokeObjectURL(value);
                this._tileOnError(done, tile);
            }, this, done, tile);
        } else {
            //Use leaflet default
            tile.onload = L.bind(this._tileOnLoad, this, done, tile);
            tile.onerror = L.bind(this._tileOnError, this, done, tile);
        }

        tile.src = value;
    },

    createTile: function (coords, done) {
        var tile = document.createElement("img");

        if (this.options.crossOrigin)
            tile.crossOrigin = "";

        tile.alt = "";//Alt tag is set to empty string to keep screen readers from reading URL and for compliance reasons

        var x = coords.x,
            y = this.options.tms ? this._globalTileRange.max.y - coords.y : coords.y,
            z = this._getZoomForUrl(),
            key = z + ',' + x + ',' + y,
            self = this;
        if (this.options.storage) {
            this.options.storage.getAttachment(key,'map', function (err, value) {
                if (value)
                    self._setUpTile(done, tile, value, true);
                else
                    self._setUpTile(done, tile, self.getTileUrl(coords));
            });
        } else {
            self._setUpTile(done, tile, self.getTileUrl(coords));
        }

        return tile;
    }
});

/**
 * Leaflet control factory
 */
var Control = L.Control.extend({
     onAdd: function (map) {
         var container = L.DomUtil.create("div", "leaflet-bar leaflet-control");
         container.innerHTML = '<a href="#" class="leaflet-control-zoom-in">' + this.options.innerHTML + "</a>";
         L.DomEvent
             .on(container, "click", L.DomEvent.stopPropagation)
             .on(container, "click", L.DomEvent.preventDefault)
             .on(container, "click", this.options.handler, map)
             .on(container, "dblclick", L.DomEvent.stopPropagation);
         return container;
     }
 });

/**
 * Main app code
 */
var app ={
    db:null,
    map:null,

     /**
      * Simple ajax wrapper
      */
     ajax: function (src, responseType, callback) {
         var xhr = new XMLHttpRequest();
         xhr.open('GET', src, true);
         xhr.responseType = responseType || 'text';
         xhr.onload = function() {
             if (this.status == 200) {
                 callback(this.response);
             }
         };
         xhr.send();
     },

     //Setup database and map
     init: function(){
         app.db = new PouchDB(config.databaseName);
         app.map = L.map("map",{
             center: [config.viewStart.lat,config.viewStart.long],
             zoom: config.viewStart.zoom,
             bounceAtZoomLimits: false
         });
         
         new StorageTileLayer("http://{s}.tile.osm.org/{z}/{x}/{y}.png", {storage: app.db}).addTo(app.map);


         // Add C control to leaflet to load cache
         app.map.addControl(new Control({position: 'topleft', innerHTML: 'C', handler: app.populateCache}));

         //Add D control to leaflet to clear cache
         app.map.addControl(new Control({position: 'topleft', innerHTML: 'D', handler: function () {
             PouchDB.destroy(config.databaseName, function (err) {
                 if (!err) {
                     app.db = new PouchDB(config.databaseName);
                 }
             });
         }}));
     },

     /**
      * OSM provided function to turn long to tile x
      */
     longToX: function (lon,zoom) { return (Math.floor((lon+180)/360*Math.pow(2,zoom))); },

     /**
      * OSM provided function to turn lat to tile y
      */
     latToY: function (lat,zoom)  { return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom))); },

     /**
      * Simple wrapper to download tile from osm
      * @param  string - key - in the following format {z},{x},{y}
      * @param  string - src - URL todownload
      */
     downloadTile: function(key, src){
         app.ajax(src, 'blob', function (response) {
             app.db.putAttachment(key, "map", 1, response, "image/png");
         });
     },

     populateCache: function () {
         var toDownload = [];
         var i=0;

         for(i =0; i<=config.layersToLoad;i++){
             var topLeftX = app.longToX(config.topLeft.long,i);
             var topLeftY = app.latToY(config.topLeft.lat,i);
             var bottomRightX = app.longToX(config.bottomRight.long,i);
             var bottomRightY = app.latToY(config.bottomRight.lat,i);

             var xLength = bottomRightX-topLeftX;
             var yLength = bottomRightY-topLeftY;
             for(var j =0; j<=xLength;j++)
                 for(var k =0; k<=yLength;k++)
                     toDownload.push(i+","+(topLeftX+j)+","+(topLeftY+k));
         }

         i =0;
         var intervalID = window.setInterval(function(){
             if(i >= toDownload.length){
                 window.clearInterval(intervalID);
                 return;
             }
             var src = 'http://tile.osm.org/' + toDownload[i].split(',').join('/') + '.png';
             app.downloadTile(toDownload[i],src);
             i++;
         },config.msThrottle);
     }
};

//Run
app.init();
