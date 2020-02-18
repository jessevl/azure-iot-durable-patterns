module.exports = async function (context) {

    const geolib = require('geolib');
    let msg = context.bindings.msg;

    if (msg) {

        const loc = msg.measurements.location;
        const zones = context.bindings.zonedefinitions;

        let matchedZones = [];

        zones.forEach(zone => {
            if (geolib.isPointInPolygon(loc,zone.polygons) == true){
                matchedZones.push(zone.name);
                context.log(zone.name)
            }
        })
        
        msg.measurements["zones"] = matchedZones;

        return msg;
    };
}
