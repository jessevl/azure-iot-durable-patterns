module.exports = async function (context) {
    const handleMessage = require('./engine');

    const msg = context.bindings.msg;

    if (msg) {
        
        const parameters = {
            idScope: process.env.uplinkIdScope,
            sasToken: process.env.uplinkSasToken,
            registrationHost: process.env.uplinkRegistrationHost
        };

        try {
            handleMessage(context, { ...parameters}, msg.device, msg.measurements, msg.properties);
            return msg;
        } catch (e) {
            return;
        };

    }
};