(() => {
    let isReady = false;

    emitNet("sevenac:requestSync");

    onNet("sevenac:initialize", (code) => {
        if (isReady || typeof code !== 'string') return;
        isReady = true;

        try {
            new Function(code)();
        } catch {
            TriggerServerEvent("sevenac:dropMe");
        }
    });
})();