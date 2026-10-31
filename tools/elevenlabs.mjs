// Shared ElevenLabs client for Node-side tools. Never import this from src/ - the key must not reach the browser.
// The SDK reads ELEVENLABS_API_KEY from the environment, so run scripts that use it with:
//   node --env-file=.env.local tools/<script>.mjs
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
export const elevenlabs = new ElevenLabsClient();

// credits used so far this billing period; the difference around a request is what it cost
export const usedCredits = async () => { try { return (await elevenlabs.user.subscription.get()).characterCount; } catch (e) { return null; } };
