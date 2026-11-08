/**
 * Captions for the people on camera, timed in source-file seconds (whisper.cpp word timings checked against
 * silence detection). Wording follows the speech; fillers ("um", "uh") and false starts are dropped, and the
 * product name is written as the brand, "Fix Please".
 */
export interface Cue {
  from: number;
  to: number;
  text: string;
}

export const CAPTIONS: Record<string, Cue[]> = {
  scene1: [
    {from: 0.85, to: 1.75, text: 'The light’s out!'},
    {from: 1.8, to: 3.9, text: 'Oh yeah, who should we talk to? The school?'},
    {from: 4.3, to: 7.2, text: 'Maybe. Maybe the city, maybe the power company.'},
    {from: 7.8, to: 10.55, text: 'A streetlight is out. Easy to spot, but who owns it?'},
    {from: 10.6, to: 13.6, text: 'The university? The city? The power company? The state?'},
    {from: 13.7, to: 15.3, text: 'On a campus, it could be any of them.'},
  ],
  // Starts after the cross-fade from scene 1 so the two captions never overlap.
  scene2: [{from: 0.3, to: 2.4, text: 'So, we built Fix Please.'}],
  scene3: [
    {from: 0.27, to: 2.3, text: 'First, you’re going to start with the photo.'},
    {from: 2.4, to: 6.3, text: 'We took a photo of the light post from earlier in the day,'},
    {from: 6.4, to: 10.6, text: 'and Fix Please prepares it right on the device.'},
    {from: 10.8, to: 13.15, text: 'It shrinks it and then strips a lot'},
    {from: 13.15, to: 16.3, text: 'of the hidden metadata before the upload.'},
    {from: 16.4, to: 18.6, text: 'If the photo has GPS, then Fix Please uses that'},
    {from: 18.6, to: 21.9, text: 'to suggest where you were standing when the photo was taken.'},
    {from: 22.6, to: 24.3, text: 'Right here, as you can see,'},
    {from: 24.3, to: 27.7, text: 'you can pin the exact location when the map is loading.'},
    {from: 31.9, to: 34.3, text: 'But right now, you can see that the address'},
    {from: 34.3, to: 36.6, text: 'of where we were when we took this photo is displayed.'},
    {from: 40.4, to: 42.4, text: 'You can accept the GPS suggestion'},
    {from: 42.4, to: 47.2, text: 'or enter a real address here on this text bar, right here.'},
    {from: 57.0, to: 59.55, text: 'Next, pin the exact pole.'},
    {from: 61.85, to: 64.9, text: 'And then we can confirm that, yes, it’s here.'},
  ],
};
