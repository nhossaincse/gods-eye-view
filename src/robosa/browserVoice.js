export class BrowserVoice {
  constructor({ onTranscript, onListeningChange, onSpeakingChange, onError }) {
    this.onTranscript = onTranscript;
    this.onListeningChange = onListeningChange;
    this.onSpeakingChange = onSpeakingChange;
    this.onError = onError;
    this.recognition = null;
    this.listening = false;

    const Recognition =
      globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (Recognition) {
      this.recognition = new Recognition();
      this.recognition.lang = 'en-US';
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 1;
      this.recognition.onstart = () => this.setListening(true);
      this.recognition.onend = () => this.setListening(false);
      this.recognition.onerror = (event) => {
        this.setListening(false);
        const message =
          event.error === 'not-allowed'
            ? 'Microphone permission was not granted.'
            : 'I could not hear that. Try again or type your message.';
        this.onError?.(message);
      };
      this.recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0]?.transcript || '')
          .join(' ')
          .trim();
        if (transcript) this.onTranscript?.(transcript);
      };
    }
  }

  get canListen() {
    return Boolean(this.recognition);
  }

  get canSpeak() {
    return Boolean(
      globalThis.speechSynthesis && globalThis.SpeechSynthesisUtterance,
    );
  }

  setListening(value) {
    this.listening = value;
    this.onListeningChange?.(value);
  }

  toggleListening() {
    if (!this.recognition) {
      this.onError?.(
        'Voice input is not supported in this browser. You can still type below.',
      );
      return;
    }
    if (this.listening) this.recognition.stop();
    else {
      globalThis.speechSynthesis?.cancel();
      this.recognition.start();
    }
  }

  speak(text) {
    if (!this.canSpeak || !String(text || '').trim()) return;
    globalThis.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.rate = 0.94;
    utterance.pitch = 0.72;
    utterance.volume = 1;

    const voices = globalThis.speechSynthesis.getVoices();
    utterance.voice =
      voices.find(
        (voice) => /^en[-_]/i.test(voice.lang) && voice.localService,
      ) ||
      voices.find((voice) => /^en[-_]/i.test(voice.lang)) ||
      voices[0] ||
      null;
    utterance.onstart = () => this.onSpeakingChange?.(true);
    utterance.onend = () => this.onSpeakingChange?.(false);
    utterance.onerror = () => this.onSpeakingChange?.(false);
    globalThis.speechSynthesis.speak(utterance);
  }

  stopSpeaking() {
    globalThis.speechSynthesis?.cancel();
    this.onSpeakingChange?.(false);
  }

  dispose() {
    if (this.listening) this.recognition?.stop();
    this.stopSpeaking();
  }
}
