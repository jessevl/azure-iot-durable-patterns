const df = require("durable-functions");

module.exports = df.orchestrator(function*(context) {
    try {
        const msgGeo = yield context.df.callActivity("EnrichGeofence", context.bindingData.context.input);
        const msgZone = yield context.df.callActivity("EnrichZoneStatus", msgGeo);
        const output = yield context.df.callActivity("UplinkBridge", msgZone);

        return output;
    } catch (error) {
        context.log("Error from orchestrator:"+error);
    }
});