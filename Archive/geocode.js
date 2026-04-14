Qualtrics.SurveyEngine.addOnload(function() {
	this.disableNextButton();
	var container = this;
	var done = $j("<a>done</a>");
	done.click(function(e) {
		var address = container.getTextValue();

        var geocoder = new google.maps.Geocoder();
		geocoder.geocode({address: address, componentRestrictions: {country: "Chile"}}, function(results, status) {
            if (status == 'OK') {
                Qualtrics.SurveyEngine.setEmbeddedData("lat", results[0].geometry.location.lat());
                Qualtrics.SurveyEngine.setEmbeddedData("lon", results[0].geometry.location.lng());
                container.clickNextButton();
            } else {
                container.displayErrorMessage("Unable to process your postal code. Please try again.");
            }
        });
	});	
	$j(this.getQuestionContainer()).append(done);
});
