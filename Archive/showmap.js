Qualtrics.SurveyEngine.addOnload(function() {
  
  var polycolor = "#000000"; // black turns grey with opacity
  var fillopacity = 0.5;
  var strokeweight = 1;

  var raw = "${e://Field/MapDrawing}"; 

  var canvas = $j("<div id = 'map_canvas' width = '100%' height = '400px'>");
  $j(this.questionContainer).append(canvas);
  canvas.height("400px");

  var staticMap = function(canvas, center) {
    return(new google.maps.Map(canvas,{
      center: center,
      zoom: 8,
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      draggable: false,
      disableDefaultUI: true,
      disableDoubleClickZoom: true,
      scrollwheel: false
    }));
  }

  if (raw != "") {
    var bounds = new google.maps.LatLngBounds();
    var polygons = $j.map(raw.split(";"), function(linestr, idx) {
      var latlngs = $j.map(linestr.split(","), function(pair, idx) {
        var tmp = pair.split(" ");
        var ll = new google.maps.LatLng(tmp[1], tmp[0]);
        bounds.extend(ll);
        return(ll);
      });
      return(new google.maps.Polygon({paths: latlngs, 
                                      fillColor: polycolor,
                                      fillOpacity: fillopacity,
                                      strokeColor: polycolor,
                                      strokeWeight: strokeweight}));

    }); 

    var map = staticMap(canvas[0], bounds.getCenter());

    map.fitBounds(bounds);
    $j.each(polygons, function(idx, p) {
      p.setMap(map);
    });
  }
});
