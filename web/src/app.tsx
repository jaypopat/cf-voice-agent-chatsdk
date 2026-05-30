import { useVoiceAgent } from "@cloudflare/voice/react";

const AUTH_TOKEN = import.meta.env.VITE_BROWSER_AUTH_TOKEN as
  | string
  | undefined;
const AGENT_NAME = "voice-agent";
const INSTANCE_NAME = "default";
const AUDIO_LEVEL_MAX = 100;

export function App() {
  const {
    status,
    transcript,
    interimTranscript,
    audioLevel,
    isMuted,
    connected,
    error,
    startCall,
    endCall,
    toggleMute,
  } = useVoiceAgent({
    agent: AGENT_NAME,
    name: INSTANCE_NAME,
    query: { token: AUTH_TOKEN },
  });

  const inCall = status !== "idle";
  const levelPercent = Math.min(AUDIO_LEVEL_MAX, audioLevel * AUDIO_LEVEL_MAX);

  return (
    <main className="app">
      <h1>Voice Assistant</h1>

      {AUTH_TOKEN ? null : (
        <p className="notice">
          VITE_BROWSER_AUTH_TOKEN is not set. The Worker will reject the voice
          connection until you provide it (see web/.env.example).
        </p>
      )}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="controls">
        <button
          className={inCall ? "btn-call active" : "btn-call"}
          onClick={() => {
            if (inCall) {
              endCall();
            } else {
              startCall().catch(() => {
                // startCall rejections (e.g. denied mic) surface via `error`.
              });
            }
          }}
          type="button"
        >
          {inCall ? "End call" : "Start call"}
        </button>

        <button
          aria-pressed={isMuted}
          disabled={!inCall}
          onClick={toggleMute}
          type="button"
        >
          {isMuted ? "Unmute" : "Mute"}
        </button>

        <span className="status">
          {connected ? "connected" : "disconnected"} · {status}
        </span>
      </div>

      <div aria-hidden="true" className="controls">
        <div className="level-track">
          <div className="level" style={{ width: `${levelPercent}%` }} />
        </div>
      </div>

      <h2>Conversation</h2>
      {transcript.length === 0 && !interimTranscript ? (
        <p className="empty">No messages yet. Start a call and speak.</p>
      ) : (
        <ul className="transcript">
          {transcript.map((message) => (
            <li
              className={`msg ${message.role}`}
              key={`${message.role}-${message.timestamp}-${message.text}`}
            >
              <span className="role">{message.role}</span>
              {message.text}
            </li>
          ))}
          {interimTranscript ? (
            <li className="msg interim">
              <span className="role">user · speaking</span>
              {interimTranscript}
            </li>
          ) : null}
        </ul>
      )}
    </main>
  );
}
