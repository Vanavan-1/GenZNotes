# GenZNotes

A lightweight, local-first learning journal that turns **voice-to-text** answers, **images**, and **reference links** into structured, ordered `README.md` notes — so when you revisit a topic months later (like PCB design, hardware builds, or coding setups), every step is clean and easy to follow.

## Features

- **4 Guided Questions**: Captures what you built/learned, ordered steps, detailed per-step notes, and key takeaways/gotchas.
- **Voice-to-Text Capture**: Built-in browser speech recognition (`SpeechRecognition` / `webkitSpeechRecognition`) with live interim transcripts and multi-locale support (`en-US`, `en-IN`, `en-GB`).
- **Image Attachments**: Drag-and-drop or browse screenshots, schematics, and photos with custom captions and a lightbox viewer.
- **Reference Links**: Attach labeled documentation, datasheets, and tutorial URLs.
- **Ordered Guide & Raw `README.md`**: View notes as a numbered visual timeline or switch to the generated `README.md` to copy or download.
- **Zero External Dependencies**: Pure Node.js backend + vanilla HTML/CSS/JS frontend storing notes on disk under `data/notes/<slug>/`.

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- Chrome or Edge (for Web Speech API voice-to-text)

### Run Locally

```bash
git clone https://github.com/Vanavan-1/GenZNotes.git
cd GenZNotes
npm start
```

Then open [http://localhost:3456](http://localhost:3456) in your browser.

On first launch, a sample **PCB Design Workflow (KiCad)** note is automatically created so you can explore the ordered reader format right away.

## Project Structure

```text
GenZNotes/
├── server.js          # Zero-dependency Node.js HTTP server & REST API
├── package.json
├── public/
│   ├── index.html     # Library, Guided Q&A Editor, and Ordered Reader views
│   ├── styles.css     # Dark-mode UI styling
│   └── app.js         # Voice-to-text, image/link handling, and API client
└── data/              # Created at runtime to store notes, images, and README.md files
```

## License

MIT
