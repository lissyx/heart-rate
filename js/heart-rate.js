var HeartRate = {

  _camera: 0,
  _iteration: 0.0,
  _minBPM: 20,
  _maxBPM: 240,
  _prevsecs: 0.0,
  _nbpulses: 0.0,
  _start: 0.0, 
  _currsecs: 0.0,
  _maxRed: 0.0,
  _inc: 1.0,
  _redOffset: 0,
  _imageData: undefined,
  _prevValue: undefined,
  _prevDeriv: undefined,
  _prevPulseFrame: 0.0,

  get viewfinder() {
    return document.getElementById('video');
  },

  get log() {
    return document.getElementById('log');
  },

  get fid() {
    return document.getElementById('fid');
  },

  init: function heartrate_init() {
    var self = this;
    var settings = window.navigator.mozSettings;
    if (settings) {
      var key = "deviceinfo.hardware";
      var getPlatform = settings.createLock().get(key);
      getPlatform.addEventListener('success', function onsuccess() {
        var platform = getPlatform.result[key];
        /* Nexus S has a bug, inverting red and blue channel */
        if (platform == "herring") {
          this._redOffset = 2;
        }
      });
    }
    var video = this.viewfinder;
    this.canvas = document.getElementById('image');
    this.ctx1 = this.canvas.getContext('2d');
    video.addEventListener("play", function() {
      self._start = window.mozAnimationStartTime;
      self._maxRed = ((self.canvas.width * self.canvas.height) / self._inc) * 255.0;
      self.timerCallback(0);
    }, false);
    this.setSource(this._camera);
  },

  dbg: function heartrate_debug(msg) {
    console.debug(msg);
    return;
  },

  timerCallback: function heartrate_callback(timestamp) {
    var self = this;

    if (this.viewfinder.paused || this.viewfinder.ended) {
      this.dbg("Not playing: paused=" + this.viewfinder.paused + "; ended=" + this.viewfinder.ended);
      return;
    }

    if (this.canvas.width <= 0 || this.canvas.height <= 0) {
      this.dbg("Empty canvas.");
    } else {
      if (timestamp == 0) {
        timestamp = new Date().getTime();
      }
      this.ctx1.drawImage(this.viewfinder, 0, 0, this.canvas.width, this.canvas.height);
      this._imageData = this.ctx1.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this._currsecs = this.viewfinder.currentTime;
      this._iteration = this.viewfinder.mozPaintedFrames;
      this.computeFrame();
    }

    mozRequestAnimationFrame(function(ts) { self.timerCallback(ts); });
    // setTimeout(function() { self.timerCallback(0); }, 30);
  },

  computeFrame: function heartrate_computeFrame() {
    var totalRed = 0.0;
    for (var x = 0; x < this._imageData.width; x += this._inc) {
      for (var y = 0; y < this._imageData.height; y += this._inc) {
        var offset = (y * this._imageData.width + x) * 4;
        totalRed += this._imageData.data[offset + this._redOffset];
      }
    }

    var curValue = ((totalRed * 1.0) / this._maxRed) * this._inc;
    var gotPulse = false;
    var derivate = undefined;
    if (this._prevValue != undefined) {
      derivate = (this._prevValue - curValue)/1.0;
      if ((derivate > 0) && (this._prevDeriv < 0)) {
        gotPulse = true;
      }
    }

    var bpm = (1.0 / (this._currsecs - this._prevsecs)) * 60.0;
    var deltaFrames = (this._iteration - this._prevPulseFrame);
    if ((gotPulse) && (deltaFrames >= 10) && (bpm >= this._minBPM) && (bpm <= this._maxBPM)) {
      this._nbpulses += 1;
      var bpm2 = (this._nbpulses * 60.0) / this._currsecs;
      this._prevsecs = this._currsecs;
      this.log.innerHTML = "BPM=" + bpm2;
    }

    this._prevValue = curValue;
    if (derivate != undefined) {
      this._prevDeriv = derivate;
    }
    if (gotPulse) {
      this._prevPulseFrame = this._iteration;
    }
  },

  setSource: function heartrate_setSource(camera) {
    this.dbg("setSource: got camera: " + camera);
    this.viewfinder.mozSrcObject = null;
    this._timeoutId = 0;

    var viewfinder = this.viewfinder;
    var style = viewfinder.style;
    var width = 240;
    var height = 400;

    style.top = ((width / 2) - (height / 2)) + 'px';
    style.left = -((width / 2) - (height / 2)) + 'px';
    style.width = width + 'px';
    style.height = height + 'px';

    function gotPreviewScreen(stream) {
      this.dbg("gotPreviewScreen: stream: " + stream);
      viewfinder.mozSrcObject = stream;
      viewfinder.play();
    }

    function gotCamera(camera) {
      this.dbg("gotCamera: got camera: " + camera);
      this._cameraObj = camera;
      this._autoFocusSupported =
        camera.capabilities.focusModes.indexOf('auto') !== -1;
      this._pictureSize =
        this._largestPictureSize(camera.capabilities.pictureSizes);
      var config = {
        profile: '480p',
        rotation: 0,
        height: height,
        width: width
      };
      this._cameraObj.flashMode = "torch";
      camera.getPreviewStream(config, gotPreviewScreen.bind(this));
    }

    var options = {};
    if (navigator.mozCameras != null) {
      this._cameras = navigator.mozCameras.getListOfCameras();
      options = {camera: this._cameras[this._camera]};
      navigator.mozCameras.getCamera(options, gotCamera.bind(this));
    }
  },

  _largestPictureSize: function heartrate_largestPictureSize(pictureSizes) {
    return pictureSizes.reduce(function(acc, size) {
      if (size.width + size.height > acc.width + acc.height) {
        return size;
      } else {
        return acc;
      }
    });
  },

  pause: function heartrate_pause() {
    this.viewfinder.pause();
    this.viewfinder.mozSrcObject = null;
  },

  resume: function heartrate_resume() {
    this.setSource(this._camera);
  },
};

window.addEventListener('DOMContentLoaded', function HeartRateInit() {
  HeartRate.init();
});

document.addEventListener('mozvisibilitychange', function() {
  if (document.mozHidden) {
    HeartRate.pause();
  } else {
    HeartRate.resume();
  }
});

window.addEventListener('beforeunload', function() {
  HeartRate._cameraObj.flashMode = "off";
  HeartRate.viewfinder.src = null;
});
