<div align="center">
  <img src="public/logo/1024.png" alt="Hand-Outs Logo" width="160">
  <h1>Contributing to Hand-Outs</h1>
  <p>Thank you for your interest in contributing! This project is a simple, privacy-first tool for turning PDF presentations into printable handout sheets, and contributions are welcome.</p>
</div>



---

## Getting Started

1. **Fork** the repository
2. **Clone** your fork:
   ```bash
   git clone https://github.com/your-username/PDF-Slides-to-Handouts-Converter.git
   cd PDF-Slides-to-Handouts-Converter
   ```
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Start the development server:**
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 14 (App Router) |
| UI | React 18, TailwindCSS, shadcn/ui |
| PDF Generation | pdf-lib |
| PDF Preview | pdfjs-dist |
| Theming | next-themes |
| Language | TypeScript |


---

## How to Contribute

### Reporting Bugs

- Open an [issue](https://github.com/flodlol/PDF-Slides-to-Handouts-Converter/issues) with clear steps to reproduce
- Include browser/OS info and screenshots if applicable
- Check existing issues first to avoid duplicates

### Suggesting Features

- Open an issue with the **enhancement** label
- Describe the use case and why it would be helpful
- Be as specific as possible

### Submitting Code

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Ensure the project builds without errors:
   ```bash
   npm run build
   ```
4. Run the linter:
   ```bash
   npm run lint
   ```
5. Commit your changes with a clear commit message:
   ```bash
   git commit -m "feat: add your feature description"
   ```
6. Push to your fork and open a **Pull Request**

---

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix     | Description                  |
| ---------- | ---------------------------- |
| `feat:`    | A new feature                |
| `fix:`     | A bug fix                    |
| `docs:`    | Documentation changes        |
| `style:`   | Formatting, no code change   |
| `refactor:`| Code restructuring           |
| `test:`    | Adding or updating tests     |
| `chore:`   | Maintenance tasks            |

---

## Guidelines

- **Privacy first** — No server-side processing. All PDF handling must remain client-side.
- **Keep it simple** — This tool should stay lightweight and easy to use.
- **TypeScript** — All new code should be written in TypeScript with proper types.
- **Accessibility** — Keep the UI accessible (keyboard navigation, screen readers).
- **No tracking** — Do not add analytics, telemetry, or third-party tracking.

---

## Architecture

```
app/          --> Next.js app router pages
components/   --> React UI components
lib/          --> Core logic (PDF processing, layout engine, templates)
public/       --> Static assets (logos, images)
styles/       --> Global CSS
```

---

## Questions?

Open a [discussion](https://github.com/flodlol/PDF-Slides-to-Handouts-Converter/discussions) or an issue — happy to help!
