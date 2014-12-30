module.exports = AudioControl;

//Credits go to Henrik Joreteg/ISkomorokh: https://github.com/ISkomorokh/mediastream-gain-controller

function AudioControl() {
    this._ctx = null;
    this._mic = null;
    this._gain = null;
    this._streamO = null;
    this._out = null;
    this._vol = 1;
}

AudioControl.prototype.initialize = function (input) {
    this._ctx = new window.AudioContext();
    this._mic = this._ctx.createMediaStreamSource(input);
    this._gain = this._ctx.createGain();
    this._streamO = this._ctx.createMediaStreamDestination();
    this._mic.connect(this._gain);
    this._gain.connect(this._streamO);
    this.gain(this._vol);
    this._out = this._streamO.stream;
};

AudioControl.prototype.gain = function (level) {
    if (level !== null && level !== undefined) {
        var lvl = Number(level);
        if (lvl >= 0 && lvl <= 1) {
            this._vol = level;
            if (this._gain !== null) {
                this._gain.gain.value = level;
            }
        }
        else {
            throw { msg: "Gain must be a value in the range {0..1}" };
        }
    }
    return this._vol;
};

AudioControl.prototype.out = function () {
    return this._out;
};

AudioControl.prototype.destroy = function (reset) {
    this._out = null;
    this._streamO = null;
    this._gain = null;
    this._mic = null;
    this._ctx = null;
    if (reset !== null && reset !== undefined && reset !== false) {
        //Number(true) == 1
        this._vol = Number(reset);
    }
};
