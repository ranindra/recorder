(function (window) {
    //compatible
    window.URL = window.URL || window.webkitURL;
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
    var HZRecorder = function (stream, config) {
        config = config || {};
        config.sampleBits = config.sampleBits || 8      //Sample Bits 8, 16
        config.sampleRate = config.sampleRate || (44100 / 6);   //Sample Rate(1/6 44100)
        var context = new (window.webkitAudioContext || window.AudioContext)();
        var audioInput = context.createMediaStreamSource(stream);
        var createScript = context.createScriptProcessor || context.createJavaScriptNode;
        var recorder = createScript.apply(context, [4096, 1, 1]);
        var mp3ReceiveSuccess, currentErrorCallback;
        var audioData = {
            size: 0          //Recording file length
            , buffer: []     //Recording buffer
            , inputSampleRate: context.sampleRate    //Input sampling rate
            , inputSampleBits: 16       //Input sample Bits 8, 16
            , outputSampleRate: config.sampleRate    //Output sampling rate
            , oututSampleBits: config.sampleBits       //Output sample Bits 8, 16
            , input: function (data) {
                this.buffer.push(new Float32Array(data));
                this.size += data.length;
            }
            , compress: function () { //Merge compression
                //merge
                var data = new Float32Array(this.size);
                var offset = 0;
                for (var i = 0; i < this.buffer.length; i++) {
                    data.set(this.buffer[i], offset);
                    offset += this.buffer[i].length;
                }
                //compression
                var compression = parseInt(this.inputSampleRate / this.outputSampleRate);
                var length = data.length / compression;
                var result = new Float32Array(length);
                var index = 0, j = 0;
                while (index < length) {
                    result[index] = data[j];
                    j += compression;
                    index++;
                }
                return result;
            }
            , encodeWAV: function () {
                var sampleRate = Math.min(this.inputSampleRate, this.outputSampleRate);
                var sampleBits = Math.min(this.inputSampleBits, this.oututSampleBits);
                var bytes = this.compress();
                var dataLength = bytes.length * (sampleBits / 8);
                var buffer = new ArrayBuffer(44 + dataLength);
                var data = new DataView(buffer);
                var channelCount = 1;//Mono
                var offset = 0;
                var writeString = function (str) {
                    for (var i = 0; i < str.length; i++) {
                        data.setUint8(offset + i, str.charCodeAt(i));
                    }
                }
                //Resource exchange file identifier 
                writeString('RIFF'); offset += 4;
                // The next address starts to the total number of bytes at the end of the file, that is, the file size -8 
                data.setUint32(offset, 36 + dataLength, true); offset += 4;
                // WAV file
                writeString('WAVE'); offset += 4;
                // Waveform format flag 
                writeString('fmt '); offset += 4;
                // Filter bytes, usually 0x10 = 16 
                data.setUint32(offset, 16, true); offset += 4;
                // Format category (sampled data in PCM format) 
                data.setUint16(offset, 1, true); offset += 2;
                //Number of channels 
                data.setUint16(offset, channelCount, true); offset += 2;
                // Sample rate, number of samples per second, indicating the playback speed of each channel
                data.setUint32(offset, sampleRate, true); offset += 4;
                // Waveform data transfer rate (average number of bytes per second) Mono × Data bits per second × Data bits per sample / 8
                data.setUint32(offset, channelCount * sampleRate * (sampleBits / 8), true); offset += 4;
                // Fast data adjustment number Number of bytes occupied at one time Mono × Number of data bits per sample / 8 
                data.setUint16(offset, channelCount * (sampleBits / 8), true); offset += 2;
                // Number of data per sample 
                data.setUint16(offset, sampleBits, true); offset += 2;
                // Data identifier 
                writeString('data'); offset += 4;
                // The total number of sampled data, that is, the total size of the data-44 
                data.setUint32(offset, dataLength, true); offset += 4;
                // Write sampled data 
                if (sampleBits === 8) {
                    for (var i = 0; i < bytes.length; i++, offset++) {
                        var s = Math.max(-1, Math.min(1, bytes[i]));
                        var val = s < 0 ? s * 0x8000 : s * 0x7FFF;
                        val = parseInt(255 / (65535 / (val + 32768)));
                        data.setInt8(offset, val, true);
                    }
                } else {
                    for (var i = 0; i < bytes.length; i++, offset += 2) {
                        var s = Math.max(-1, Math.min(1, bytes[i]));
                        data.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                    }
                }
                return new Blob([data], { type: 'audio/wav' });
            }
        };
        //start recording
        this.start = function () {
            audioInput.connect(recorder);
            recorder.connect(context.destination);
        }
        //stop
        this.stop = function () {
            recorder.disconnect();
        }
        //Get audio files
        this.getBlob = function () {
            this.stop();
            return audioData.encodeWAV();
        }
        //Playback
        this.play = function (audio) {
            audio.src = window.URL.createObjectURL(this.getBlob());
        }
        //Upload
        this.upload = function (url, callback) {
            var fd = new FormData();
            fd.append("audioData", this.getBlob());
            var xhr = new XMLHttpRequest();
            if (callback) {
                xhr.upload.addEventListener("progress", function (e) {
                    callback('uploading', e);
                }, false);
                xhr.addEventListener("load", function (e) {
                    callback('ok', e);
                }, false);
                xhr.addEventListener("error", function (e) {
                    callback('error', e);
                }, false);
                xhr.addEventListener("abort", function (e) {
                    callback('cancel', e);
                }, false);
            }
            xhr.open("POST", url);
            xhr.send(fd);
        }
        //Audio collection
        recorder.onaudioprocess = function (e) {
            audioData.input(e.inputBuffer.getChannelData(0));
            //record(e.inputBuffer.getChannelData(0));
        }
    };
    //Throw an exception
    HZRecorder.throwError = function (message) {
        alert(message);
        throw new function () { this.toString = function () { return message; } }
    }
    //Whether to support recording
    HZRecorder.canRecording = (navigator.getUserMedia != null);
    //Get the recorder
    HZRecorder.get = function (callback, config) {
        if (callback) {
            if (navigator.getUserMedia) {
                navigator.getUserMedia(
                    { audio: true } //只启用音频
                    , function (stream) {
                        var rec = new HZRecorder(stream, config);
                        callback(rec);
                    }
                    , function (error) {
                        switch (error.code || error.name) {
                            case 'PERMISSION_DENIED':
                            case 'PermissionDeniedError':
                                HZRecorder.throwError('User refused to provide information');
                                break;
                            case 'NOT_SUPPORTED_ERROR':
                            case 'NotSupportedError':
                                HZRecorder.throwError('The browser does not support hardware devices.');
                                break;
                            case 'MANDATORY_UNSATISFIED_ERROR':
                            case 'MandatoryUnsatisfiedError':
                                HZRecorder.throwError('The specified hardware device could not be discovered.');
                                break;
                            default:
                                HZRecorder.throwError('Unable to open the microphone. Exception information:' + (error.code || error.name));
                                break;
                        }
                    });
            } else {
                HZRecorder.throwErr('The current browser does not support recording.'); return;
            }
        }
    }
    window.HZRecorder = HZRecorder;
})(window);