Qualtrics.SurveyEngine.addOnload(function() {
	  // This enables a respondent to draw on the map and records the coordinates of their drawing. //
  // by the great Mark Fredrickson //
	
  var postalcode = "${e://loc/PostalCode}"
  
  //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
 function getRandomIntInclusive(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min; //The maximum is inclusive and the minimum is inclusive 
}
  var zoom =getRandomIntInclusive(10,20);
	
  var address = this;
  
  // polygon defaults
  var polycolor = "#000000"; // black turns grey with opacity
  var fillopacity = 0.5;
  var strokeweight = 1;
   
  var makeButton = function(text) {
    return($j("<a class = 'drawing-button'><span class = 'ui-button-text'>" + text + "</span></a>"))
  }
  
  var widget = document.createElement("div");
  widget.setAttribute('style', 'width: 100%; height: 80%; margin: auto; text-align: center;');
  $(address.getQuestionContainer()).append(widget);

  var canvas = document.createElement("div");
  canvas.id = 'map_canvas';
  canvas.setAttribute('style', 'width: 90%; height: 400px; margin: 100px auto;');
  
  widget.appendChild(canvas);

  var communities = [];
	var lat = "${e://Field/lat}";
	var lon = "${e://Field/lon}";
  // var zoom = 6;

  var center = new google.maps.LatLng(lat, lon);
  var options = {center: center,
                zoom: zoom,
                mapTypeId: google.maps.MapTypeId.ROADMAP,
                scrollwheel: false,
                maxZoom: 20,
                minZoom: 4,
                streetViewControl: false};

  var map = new google.maps.Map(canvas,
                                options);

  var drawingManager = new google.maps.drawing.DrawingManager({
      drawingControl: false,
      drawingControlOptions: {
          drawingModes: [google.maps.drawing.OverlayType.POLYGON]
      },
      polygonOptions: { editable: true }
  });
  drawingManager.setMap(map);
  drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON); // start the user in drawing mode

  var stopToggle = false;

  var mkButton = function(txt) {

      var style = "font-size: " + Math.ceil(0.025 * Math.min($j(document).width(), $j(document).height())) + "px;";
      return($j("<div class = 'mapbutton' style = '" + style + "'><b>" + txt + "</b></div>"));
  }

  var resetButton = mkButton("Reset");
  var doneButton  = mkButton("Done");
  var abortButton = mkButton("Stop");
  var drawButton  = mkButton("Draw");

  var startDrawing = function() {
      stopToggle = false; // just to be sure
      drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
      drawButton.hide();
      abortButton.show();
  }

  var stopDrawing = function() {
      drawingManager.setDrawingMode(null);
      drawButton.show();
      abortButton.hide();
  }
                               
  resetButton.click(function() {
      $j.each(communities, function(idx, c) { c.setMap(null); })
      communities = [];
      stopToggle = true;
      stopDrawing();
      return(false);
  });
                               
  doneButton.click(function() {
      stopToggle = true;
      stopDrawing();
      // $j("form").submit();

    var asString = $j.map(communities,
                         function(p) {
                           return($j.map(p.getPath().getArray(), function(i) {
                             return(i.lng() + " " + i.lat()); }).join(',')) }).join(';');

	Qualtrics.SurveyEngine.setEmbeddedData("zoom", zoom);
    Qualtrics.SurveyEngine.setEmbeddedData("MapDrawing", asString);
    address.clickNextButton();
  });


  abortButton.click(function() { stopToggle = true; stopDrawing() });
  drawButton.click(startDrawing);

  startDrawing();

  var buttonContainer = $j("<div>");
  buttonContainer.append(drawButton);
  buttonContainer.append(abortButton);
  buttonContainer.append(resetButton);
  buttonContainer.append(doneButton);
  buttonContainer.css("z-index", 1);

  map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(buttonContainer[0]);

  // rawWidget.gmap = map;

  var popupmutex = true; // prevents multiple pop ups from appearing.
  // var communities = [];
  google.maps.event.addListener(
      drawingManager,
      'polygoncomplete',
      function(poly) {
          if (!stopToggle) {

              // save the polygon to the array of drawings
              communities.push(poly);
              stopToggle = false;

              google.maps.event.addListener(poly, 'click', function(e) {
                  if (popupmutex) {
                      popupmutex = false;
                      // Note: might be slightly more efficient to create the window
                      // once, rather than for each click.
                      var content = $j("<div class = 'delete-community'></div>").addClass("polygon-popup"); 
                      content.append($j("<p>Do you want to delete this community?</p>"));
                      var buttons = $j("<p></p>");
                      buttons.append(
                          makeButton("Yes").click(function() {
                              // TODO: remove poly from list of polys
                              communities = $j.grep(communities, function(e,i) { return e !== poly; }) 
                              poly.setMap(null);
                              popup.close();
                              popupmutex = true;
                          }));
                      buttons.append(makeButton("No").click(function() {
                          popup.close();
                          popupmutex = true;
                          return(false);
                      }));
                      content.append(buttons);
                      content.append("<div>");

                      var popup = new google.maps.InfoWindow({content: content[0], position: e.latLng});

                      google.maps.event.addListener(popup, "closeclick", function() {
                          popupmutex = true;
                      });
                      popup.open(map);
                  }
          });
      } else {
          poly.setMap(null); // discard the poly because the user click abort/reset/etc.
      }
    stopToggle = false;
  });
});
