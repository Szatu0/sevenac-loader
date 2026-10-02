(() => {
    'use strict';

    const https = require('https');
    const url = require('url');

    const RESOURCE_NAME = GetCurrentResourceName();
    const AUTH_TOKEN = GetConvar('sevenac_key', '').trim();
    const API_URL = 'https://sevenac.eu/script/index.php';

    let clientPayload = null;
    let isLoaded = false;
    let lastSyncAttempt = 0;

    function shutdown(reason) {
        console.error(`^1[SevenAC FATAL] ${reason}^0`);
        StopResource(RESOURCE_NAME);
    }

    if (!AUTH_TOKEN || AUTH_TOKEN.length < 8) {
        shutdown('Missing or invalid sevenac_key convar in server.cfg');
        return;
    }

    async function syncCloudWithRetry(maxRetries = 3, delay = 1000) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await syncCloud();
                return response;
            } catch (err) {
                console.warn(`Sync attempt ${attempt + 1} failed: ${err.message}`);
                if (attempt === maxRetries - 1) throw err;
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
            }
        }
    }

    async function syncCloud() {
        const body = JSON.stringify({ token: AUTH_TOKEN });
        const parsedUrl = new URL(API_URL);

        const req = https.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Sevenac-Token': AUTH_TOKEN,
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: 10000
        });

        return new Promise((resolve, reject) => {
            req.on('error', (err) => reject(err));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Connection timed out'));
            });

            req.on('response', (res) => {
                let rawData = '';
                res.on('data', (chunk) => { rawData += chunk; });
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        return reject(new Error(`HTTP ${res.statusCode}: ${rawData}`));
                    }

                    try {
                        const parsed = JSON.parse(rawData);
                        if (parsed.success && parsed.server && parsed.client) {
                            resolve(parsed);
                        } else {
                            reject(new Error(parsed.error || 'Invalid cloud payload structure'));
                        }
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.write(body);
            req.end();
        });
    }

    async function loadInitialCloud() {
        try {
            const data = await syncCloudWithRetry();

            new Function(data.server)();
            clientPayload = data.client;
            isLoaded = true;
        } catch (err) {
            shutdown(`Failed to initialize cloud: ${err.message}`);
        }
    }

    loadInitialCloud();

    setInterval(async () => {
        const now = Date.now();
        if (!isLoaded || now - lastSyncAttempt < 300000) return;

        try {
            const data = await syncCloudWithRetry();
            if (data.client !== clientPayload) {
                clientPayload = data.client;
            }
        } catch (err) {
            shutdown(`License validation revoked: ${err.message}`);
        } finally {
            lastSyncAttempt = now;
        }
    }, 300000);

    onNet('sevenac:requestSync', (src) => {
        if (!src || Number(src) <= 0) return;

        if (!clientPayload || !isLoaded) {
            setTimeout(() => {
                if (clientPayload && isLoaded) {
                    emitNet('sevenac:initialize', src, clientPayload);
                } else {
                    DropPlayer(String(src), '[SevenAC] Server security synchronization error.');
                }
            }, 1500);
            return;
        }

        emitNet('sevenac:initialize', src, clientPayload);
    });

    onNet('sevenac:dropMe', (src, reason) => {
        if (!src || Number(src) <= 0) return;

        DropPlayer(String(src), `[SevenAC] Client initialization failed (${reason || 'SECURITY_FAULT'}).`);
    });

    onResourceStop(RESOURCE_NAME, () => {
        console.info('[SevenAC] Resource stopped gracefully.');
    });
})();