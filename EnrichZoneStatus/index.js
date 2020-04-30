module.exports = async function (context) {

    context.log("[v0.3] Enriching msg with zone status");

    let msg = context.bindings.msg;

    if (msg) {
        const zonestatus = context.bindings.zonestatus;
        msg.desiredProperties["distress"];

        // TODO: implement highest distress level picking
        msg.measurements.zones.forEach(zone => {
            var status = zonestatus.find(o => o.RowKey == zone);
            msg.desiredProperties["distress"] = status.Distress;
        })

        return msg;
    }
};