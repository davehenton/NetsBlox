if(!process.env.GOOGLE_GEOCODING_API) {
    console.log('Warning: environment variable GOOGLE_GEOCODING_API not defined, Geolocation RPC will not work.');
} else {

    let GeoLocationRPC = {};

    var debug = require('debug'),
        error = debug('netsblox:rpc:geolocation:error'),
        CacheManager = require('cache-manager'),
        NodeGeocoder = require('node-geocoder'),
        rp = require('request-promise'),
        jsonQuery = require('json-query'),
        trace = debug('netsblox:rpc:geolocation:trace');

    // init
    var cache = CacheManager.caching({store: 'memory', max: 1000, ttl: 36000}),
        GEOCODER_API = process.env.GOOGLE_GEOCODING_API,
        geocoder = NodeGeocoder({
            provider: 'google',
            httpAdapter: 'https', // Default
            apiKey: GEOCODER_API, // for Mapquest, OpenCage, Google Premier
            formatter: null         // 'gpx', 'string', ...
        });

    // helper to filter json down
    function queryJson(json, query){
        let res =  jsonQuery(query, {data: json}).value;
        if (typeof(res) === 'object') {
            res = JSON.stringify(res);
        }
        return res;
    }

    // reverse geocoding helper, doesn't return a promise. handles sending of response.
    let reverseGeocode = (lat, lon, response, query)=>{
        cache.wrap(lat + ', ' + lon + query, cacheCallback => {
            trace('Geocoding (not cached)', lat, lon);
            geocoder.reverse({lat, lon})
                .then(function(res) {
                // only intereseted in the first match
                    res = queryJson(res[0], query);
                    if (res === null) return cacheCallback('not found', null);
                    // send the response to user
                    return cacheCallback(null, res);
                })
                .catch((err) => {
                    error(err);
                    return cacheCallback('Error in reverse geocoding', null);
                });
        }, (err, results) => {
            if(results){
                trace('answering with',results);
                response.send(results);
            }else {
                showError(err, response);
            }
        });
    };


    /**
     * Geolocates the address and returns the coordinates
     * @param {String} address target address
     * @returns {Object}
     */

    GeoLocationRPC.geolocate = function (address) {
        let response = this.response;

        trace('Geocoding', address);
        geocoder.geocode(address)
            .then(function(res) {
                trace(res);
                response.json([['latitude', res[0].latitude], ['longitude', res[0].longitude]]);
            })
            .catch(function(err) {
                error('Error in geocoding', err);
                showError('Failed to geocode',response);
            });

        return null;
    };

    /** 
     * Get the name of the city nearest to the given latitude and longitude.
     *
     * @param {Latitude} latitude latitude of the target location
     * @param {Longitude} longitude longitude of the target location
     * @returns {String} city name
     */

    GeoLocationRPC.city = function (latitude, longitude) {
        reverseGeocode(latitude, longitude, this.response, '.city');
        return null;
    };

    GeoLocationRPC['county*'] = function (latitude, longitude) {
        reverseGeocode(latitude, longitude, this.response, '.administrativeLevels.level2long');
        return null;
    };

    GeoLocationRPC['state*'] = function (latitude, longitude) {
        reverseGeocode(latitude, longitude, this.response, '.administrativeLevels.level1long');
        return null;
    };

    GeoLocationRPC['stateCode*'] = function (latitude, longitude) {
        reverseGeocode(latitude, longitude, this.response, '.administrativeLevels.level1short');
        return null;
    };

    // reverse geocode and send back a specific detail
    GeoLocationRPC.country = function (latitude, longitude) {
        reverseGeocode(latitude, longitude, this.response, '.country');
        return null;
    };

    // reverse geocode and send back a specific detail
    GeoLocationRPC.countryCode = function (latitude, longitude) {
        reverseGeocode(latitude, longitude, this.response, '.countryCode');
        return null;
    };

    // administrative levels
    GeoLocationRPC.info = function (latitude, longitude) {
        return geocoder.reverse({lat: latitude, lon: longitude})
            .then( res => {
                let levels = [];
                res = res[0]; // we only care about the top result
                // find and pull out all the provided admin levels
                levels.push(res.city);
                Object.keys(res.administrativeLevels).forEach(lvl => {
                    levels.push(res.administrativeLevels[lvl]);
                });
                levels.push(res.country);
                levels.push(res.countryCode);
                levels = levels.reverse(); // reverse so that it's big to small
                return levels;
            }).catch(err => {
                error(err);
                throw(err);
            });
    };

    /**
     * Find places near an earth coordinate (latitude, longitude) (maximum of 10 results)
     * @param {Latitude} latitude 
     * @param {Longitude} longitude
     * @param {String=} keyword the keyword you want to search for, like pizza or cinema.
     * @param {Number=} radius search radius in meters (50km)
     */

    GeoLocationRPC.nearbySearch = function (latitude, longitude, keyword, radius) {
        let response = this.response;
        radius = radius || 50000; // default to 50KM

        let requestOptions = {
            method: 'get',
            uri: 'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
            qs: {
                location: latitude + ',' + longitude,
                radius: radius,
                // rankby: 'distance',
                key: GEOCODER_API
            },
            json: true
        };

        if (keyword) {
            requestOptions.qs.keyword = keyword;
        }

        return rp(requestOptions).then(res=>{
            let places = res.results;
            places = places.map(place => {
                return [['latitude',place.geometry.location.lat],['longitude',place.geometry.location.lng],['name',place.name],['types',place.types]];
            });
            // keep the 10 best results
            places = places.slice(0,10);
            response.send(places);
        }).catch(err => {
            error('Error in searching for places',err);
            showError('Failed to find places',response);
        });

    };



    function showError(err, response) {
        // if we can't answer their question return snap null
        response.send('null');
    }

    module.exports = GeoLocationRPC;
}
