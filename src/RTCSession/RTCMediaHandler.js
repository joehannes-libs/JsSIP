module.exports = RTCMediaHandler;

/**
 * Dependencies.
 */
var JsSIP_C = require('../Constants');
var WebRTC = require('../WebRTC');
var AudioControl = require('../AudioControl');


/* RTCMediaHandler
 * -class PeerConnection helper Class.
 * -param {RTCSession} session
 * -param {Object} [contraints]
 */
function RTCMediaHandler(session, constraints) {
  constraints = constraints || {};

  this.logger = session.ua.getLogger('jssip.rtcsession.rtcmediahandler', session.id);
  this.session = session;
  this.localMedia = null;
  this.peerConnection = null;
  this.ready = true;
  this.audioVolume = this.session.audioVolume;

  this.init(constraints);
}


RTCMediaHandler.prototype = {
  isReady: function() {
    return this.ready;
  },

  createOffer: function(onSuccess, onFailure, constraints) {
    var self = this;

    function onSetLocalDescriptionSuccess() {
      if (self.peerConnection.iceGatheringState === 'complete' && (self.peerConnection.iceConnectionState === 'connected' || self.peerConnection.iceConnectionState === 'completed')) {
        self.ready = true;
        onSuccess(self.peerConnection.localDescription.sdp);
      } else {
        self.onIceCompleted = function() {
          self.onIceCompleted = undefined;
          self.ready = true;
          onSuccess(self.peerConnection.localDescription.sdp);
        };
      }
    }

    this.ready = false;

    this.peerConnection.createOffer(
      function(sessionDescription){
        self.setLocalDescription(
          sessionDescription,
          onSetLocalDescriptionSuccess,
          function(e) {
            self.ready = true;
            onFailure(e);
          }
        );
      },
      function(e) {
        self.ready = true;
        self.logger.error('unable to create offer');
        self.logger.error(e);
        onFailure(e);
      },
      constraints
    );
  },

  createAnswer: function(onSuccess, onFailure, constraints) {
    var self = this;

    function onSetLocalDescriptionSuccess() {
      if (self.peerConnection.iceGatheringState === 'complete' && (self.peerConnection.iceConnectionState === 'connected' || self.peerConnection.iceConnectionState === 'completed')) {
        self.ready = true;
        onSuccess(self.peerConnection.localDescription.sdp);
      } else {
        self.onIceCompleted = function() {
          self.onIceCompleted = undefined;
          self.ready = true;
          onSuccess(self.peerConnection.localDescription.sdp);
        };
      }
    }

    this.ready = false;

    this.peerConnection.createAnswer(
      function(sessionDescription){
        self.setLocalDescription(
          sessionDescription,
          onSetLocalDescriptionSuccess,
          function(e) {
            self.ready = true;
            onFailure(e);
          }
        );
      },
      function(e) {
        self.ready = true;
        self.logger.error('unable to create answer');
        self.logger.error(e);
        onFailure(e);
      },
      constraints
    );
  },

  setLocalDescription: function(sessionDescription, onSuccess, onFailure) {
    var self = this;

    this.peerConnection.setLocalDescription(
      sessionDescription,
      onSuccess,
      function(e) {
        self.logger.error('unable to set local description');
        self.logger.error(e);
        onFailure(e);
      }
    );
  },

  addStream: function(stream, onSuccess, onFailure, constraints) {
    try {
      this.ac = new AudioControl();
      this.ac.initialize(stream);
      this.ac.gain(this.gain());
      this.peerConnection.addStream(this.ac.out(), constraints);
    } catch(e) {
      this.logger.error('error adding stream');
      this.logger.error(e);
      onFailure();
      return;
    }

    onSuccess();
  },

  gain: function(audioVolume) {
    if (audioVolume !== undefined && audioVolume !== null) {
        var level = Number(audioVolume);
        if (level >= 0 && level <= 1) {
            this.audioVolume = level;
            if (this.ac && this.ac.gain) {
                this.ac.gain(this.audioVolume);
            }
        } else {
            throw {
                msg: "Audio Volume must be in range {0..1}"
            };
        }
    }
    return this.audioVolume;
  },

  /**
  * peerConnection creation.
  */
  init: function(options) {
    options = options || {};

    var idx, length, server,
      self = this,
      servers = [],
      constraints = options.constraints || {},
      stun_servers = options.stun_servers  || null,
      turn_servers = options.turn_servers || null,
      config = this.session.ua.configuration;

    if (!stun_servers) {
      stun_servers = config.stun_servers;
    }

    if (!turn_servers) {
      turn_servers = config.turn_servers;
    }

    /* Change 'url' to 'urls' whenever this issue is solved:
     * https://code.google.com/p/webrtc/issues/detail?id=2096
     */

    if (stun_servers.length > 0) {
      servers.push({'url': stun_servers});
    }

    length = turn_servers.length;
    for (idx = 0; idx < length; idx++) {
      server = turn_servers[idx];
      servers.push({
        'url': server.urls,
        'username': server.username,
        'credential': server.credential
      });
    }

    this.peerConnection = new WebRTC.RTCPeerConnection({'iceServers': servers}, constraints);

    this.peerConnection.onaddstream = function(e) {
      self.logger.debug('stream added: '+ e.stream.id);
    };

    this.peerConnection.onremovestream = function(e) {
      self.logger.debug('stream removed: '+ e.stream.id);
    };

    this.peerConnection.onicecandidate = function(e) {
      if (e.candidate) {
        self.logger.debug('ICE candidate received: '+ e.candidate.candidate);
      } else if (self.onIceCompleted !== undefined) {
        setTimeout(function() {
          self.onIceCompleted();
        });
      }
    };

    this.peerConnection.oniceconnectionstatechange = function() {
      self.logger.debug('ICE connection state changed to "'+ this.iceConnectionState +'"');

      if (this.iceConnectionState === 'failed') {
        self.session.terminate({
            cause: JsSIP_C.causes.RTP_TIMEOUT,
            status_code: 200,
            reason_phrase: JsSIP_C.causes.RTP_TIMEOUT
          });
      }
    };


    this.peerConnection.onstatechange = function() {
      self.logger.debug('PeerConnection state changed to "'+ this.readyState +'"');
    };
  },

  close: function() {
    this.logger.debug('closing PeerConnection');
    if(this.peerConnection) {
      this.peerConnection.close();

      if(this.localMedia) {
        this.localMedia.stop();
      }
    }
  },

  /**
  * -param {Object} mediaConstraints
  * -param {Function} onSuccess
  * -param {Function} onFailure
  */
  getUserMedia: function(onSuccess, onFailure, constraints) {
    var self = this;

    this.logger.debug('requesting access to local media');

    WebRTC.getUserMedia(constraints,
      function(stream) {
        self.logger.debug('got local media stream');
        self.localMedia = stream;
        onSuccess(stream);
      },
      function(e) {
        self.logger.error('unable to get user media');
        self.logger.error(e);
        onFailure();
      }
    );
  },

  /**
  * Message reception.
  * -param {String} type
  * -param {String} sdp
  * -param {Function} onSuccess
  * -param {Function} onFailure
  */
  onMessage: function(type, body, onSuccess, onFailure) {
    this.peerConnection.setRemoteDescription(
      new WebRTC.RTCSessionDescription({type: type, sdp:body}),
      onSuccess,
      onFailure
    );
  }
};
