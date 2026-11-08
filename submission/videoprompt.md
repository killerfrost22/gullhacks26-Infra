Build a Remotion composition: 1920×1080, 30 fps, ~19 s, rendered to MP4 with my audio at public/track.mp3.

Drive it from a config array of beats: { time, number, word, bg, fg, transition }. Count 1→27 with ~0.6 s per beat, hold #19 for ~2 s, and use [WORD] placeholders I'll fill in.

Visual spec:
- Background: flat color plus a subtle grain overlay (SVG feTurbulence, ~8% opacity).
- Number: ~45% of frame height in Fredoka 700. Fake 3D with a darker offset layer plus a blurred drop shadow. Spring pop-in from 0.8 to 1.05 to 1 over 6 frames.
- Label: "photo_" in small white bold lowercase, above-left of the number.
- Word: white, Anton, all caps, overlapping the left half of the number. Letters reveal left to right over 8 frames with flicker and a white glow.
- Overlay: white rounded corner brackets inset 4%, plus a red dot and "REC" in the top right, blinking at 1 Hz.
- Transitions: 5-stripe vertical panel wipe, horizontal band wipe, rotated-square zoom-through, and a 4-frame fade to a pastel tint.
- Background colors: #EBFA1F, #FAC832, #58D928, #FA87BD, #D6FB40, #E03F6D, #0C8CA1, #A133C3, #7544AD, #EE6D76. Give each a contrasting number color (navy, olive, maroon, teal, coral, lime).