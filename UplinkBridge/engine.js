/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const crypto = require('crypto');
const Device = require('azure-iot-device');
const MQTT = require('azure-iot-device-mqtt').Mqtt;
const iothub = require('azure-iothub');
var ProvisioningTransport = require('azure-iot-provisioning-device-mqtt').Mqtt;
var SymmetricKeySecurityClient = require('azure-iot-security-symmetric-key').SymmetricKeySecurityClient;
var ProvisioningDeviceClient = require('azure-iot-provisioning-device').ProvisioningDeviceClient;

const StatusError = require('./error').StatusError;
const registrationHost = 'global.azure-devices-provisioning.net';
const deviceCache = {};

/**
 * Forwards external telemetry messages for IoT Hub devices.
 * @param {{ context: Object }} context
 * @param {{ idScope: string, sasToken: string, registrationHost: string }} parameters
 * @param {{ deviceId: string }} device 
 * @param {{ [field: string]: number }} measurements 
 * @param {{ [field: string]: Object }} reportedProperties 
 * @param {{ [field: string]: Object }} desiredProperties 
 * @param { String } timestamp 
 */
module.exports = async function (context, parameters, device, measurements, reportedProperties, desiredProperties, timestamp) {
    if (device) {
        if (!device.deviceId || !/^[a-zA-Z0-9\-_]+$/.test(device.deviceId)) {
            throw new StatusError('Invalid format: deviceId must be alphanumeric, lowercase, and may contain hyphens.', 400);
        }
    } else {
        throw new StatusError('Invalid format: a device specification must be provided.', 400);
    }

    if (!validateMeasurements(measurements)) {
        throw new StatusError('Invalid format: invalid measurement list.', 400);
    }

    // TODO validate properties

    if (timestamp && isNaN(Date.parse(timestamp))) {
        throw new StatusError('Invalid format: if present, timestamp must be in ISO format (e.g., YYYY-MM-DDTHH:mm:ss.sssZ)', 400);
    }

    try {

        // Use MQTT transport by default.
        var TRANSPORT_TYPE = "MQTT";

        // Get device connection string for MQTT.
        var client = Device.Client.fromConnectionString(await getDeviceConnectionString(parameters, device), MQTT);

        // Create message object for IoT Hub.    
        const message = new Device.Message(JSON.stringify(measurements));

        // Include custom timestamp if there is one (IoT Hub will use this).
        if (timestamp) {
            message.properties.add('iothub-creation-time-utc', timestamp);
        }

        // Create IoT Hub client.
        await client.open();

        context.log('[%s] Get twin', TRANSPORT_TYPE,device.deviceId);
        const twin = await client.getTwin();
        context.log('[%s] Obtained twin for device ', TRANSPORT_TYPE,device.deviceId);

        if(measurements) {
            context.log('[%s] Sending telemetry for device ', TRANSPORT_TYPE, device.deviceId);
            await client.sendEvent(message);
            context.log('[%s] Telemetry sent for ', TRANSPORT_TYPE,device.deviceId);
        }
        
        if (reportedProperties) {
            var needsUpdate = false;

            for(var key in reportedProperties){
                if (reportedProperties[key] != twin.properties.reported[key]){
                    needsUpdate = true;
                }
            }

            if (needsUpdate) {
                await twin.properties.reported.update(reportedProperties);
                context.log('[%s] Updated twin (reported) for device ', TRANSPORT_TYPE,device.deviceId);
            } else {
                context.log('[%s] Twin (reported) is already up to date ', TRANSPORT_TYPE,device.deviceId);
            }
        }

        if (desiredProperties) {
            var needsUpdate = false;

            for(var key in desiredProperties){
                if (desiredProperties[key] != twin.properties.desired[key]){
                    needsUpdate = true;
                }
            }
            
            for(var key in desiredProperties){
                if (desiredProperties[key] != reportedProperties[key]){
                    needsUpdate = true;
                    console.log("A desired property was not yet reported back, we'll re-set the desired twin (to trigger a new change event)");
                }
            }

            if (needsUpdate) {
                context.log('[%s] Twin (desired) needs update ', "clientSDK",device.deviceId);

                var registry = iothub.Registry.fromConnectionString(parameters.clientConnectionString);

                context.log('[%s] Get twin (desired)', "clientSDK",device.deviceId);
                registry.getTwin(device.deviceId, function(err, twin){
                    if (err) {
                        context.log(err.constructor.name + ': ' + err.message);
                    } else {
                        var patch = {
                            properties: {
                                desired: desiredProperties
                            }
                        };
                        context.log('[%s] Obtained twin (desired) for device ', "clientSDK",device.deviceId);

                        twin.update(patch, function(err) {
                            if (err) {
                            context.log('Could not update twin (desired): ' + err.constructor.name + ': ' + err.message);
                            } else {
                            context.log('[%s] Updated twin (desired) for device ', "clientSDK",device.deviceId);
                            }
                        });
                    }
                });
            } else {
                context.log('[%s] Twin (desired) already up to date ', "MQTT",device.deviceId);
            }
        }

        context.log('[%s] Closing client for ', TRANSPORT_TYPE,device.deviceId);
        await client.close();
        context.log('[%s] Client closed for ', TRANSPORT_TYPE,device.deviceId);
   
    } catch (e) {
        // If the device was deleted, we remove its cached connection string
        if (e.name === 'DeviceNotFoundError' && deviceCache[device.deviceId]) {
            delete deviceCache[device.deviceId].connectionString;
        }

        throw new Error(`Unable to send telemetry for device ${device.deviceId}: ${e.message}`);
    }
};

/**
 * @returns true if measurements object is valid, i.e., a map of field names to numbers or strings.
 */
function validateMeasurements(measurements) {
    if (!measurements || typeof measurements !== 'object') {
        return false;
    }

    // for (const field in measurements) {
    //     if (typeof measurements[field] !== 'number' && !measurements[field].isArray && typeof measurements[field] !== 'string' && !isLocation(measurements[field])) {
    //         return false;
    //     }
    // }

    return true;
}

/**
 * @returns true if a measurement is a location.
 */
function isLocation(measurement) {
    if (!measurement || typeof measurement !== 'object' || typeof measurement.lat !== 'number' || typeof measurement.lon !== 'number') {
        return false;
    }

    if ('alt' in measurement && typeof measurement.alt !== 'number') {
        return false;
    }

    return true;
}

async function getDeviceConnectionString(parameters, device) {
    const deviceId = device.deviceId;

    if (deviceCache[deviceId] && deviceCache[deviceId].connectionString) {
        return deviceCache[deviceId].connectionString;
    }

    var symmetricKey = await getDeviceKey(parameters, deviceId);
    var provisioningSecurityClient = new SymmetricKeySecurityClient(deviceId, symmetricKey);
    var provisioningClient = ProvisioningDeviceClient.create(registrationHost, parameters.idScope, new ProvisioningTransport(), provisioningSecurityClient);

    var registrationResult = await provisioningClient.register();

    const connStr = 'HostName=' + registrationResult.assignedHub + ';DeviceId=' + registrationResult.deviceId + ';SharedAccessKey=' + symmetricKey;
    deviceCache[deviceId].connectionString = connStr;
    return connStr;
}

/**
 * Computes a derived device key using the primary key.
 */
async function getDeviceKey(parameters, deviceId) {
    if (deviceCache[deviceId] && deviceCache[deviceId].deviceKey) {
        return deviceCache[deviceId].deviceKey;
    }

    const key = crypto.createHmac('SHA256', Buffer.from(parameters.sasToken, 'base64'))
        .update(deviceId)
        .digest()
        .toString('base64');

    deviceCache[deviceId] = {
        ...deviceCache[deviceId],
        deviceId: key
    } 

    return key;
}