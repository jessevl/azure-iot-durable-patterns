module.exports = async function (context) {
    let msg = context.bindings.msg;

    if (msg) {
        const zonestatus = context.bindings.zonestatus;

        msg.measurements.zones.forEach(zone => {
            var status = zonestatus.find(o => o.RowKey === zone);

            if (status.Distress == true){
                msg.measurements["distress"] = true;
            }
        })

        return msg;
    }
};