import { Sandpack } from "@codesandbox/sandpack-react";
import { useMemo } from "react";

interface FileItem { path: string; content: string }
interface Props { files: FileItem[] }

const DEFAULT_APP = `export default function App() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      fontFamily: 'system-ui',
      background: 'linear-gradient(135deg,#0b0b16,#1a1530)',
      color: '#fff'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, margin: 0 }}>Your app will render here</h1>
        <p style={{ opacity: .7, marginTop: 8 }}>Ask Foundry to build something.</p>
      </div>
    </div>
  );
}`;

export function LivePreview({ files }: Props) {
  const sandpackFiles = useMemo(() => {
    const map: Record<string, { code: string }> = {};
    let hasApp = false;
    for (const f of files) {
      // Normalize: Sandpack expects keys starting with "/"
      const key = f.path.startsWith("/") ? f.path : `/${f.path}`;
      map[key] = { code: f.content };
      if (key === "/App.tsx" || key === "/App.jsx" || key === "/src/App.tsx") hasApp = true;
    }
    if (!hasApp) map["/App.tsx"] = { code: DEFAULT_APP };
    return map;
  }, [files]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-card backdrop-blur">
      <Sandpack
        template="react-ts"
        theme="dark"
        files={sandpackFiles}
        options={{
          showNavigator: true,
          showTabs: false,
          showLineNumbers: false,
          editorHeight: "calc(100vh - 240px)",
          editorWidthPercentage: 0,
          autoReload: true,
        }}
        customSetup={{
          dependencies: {
            react: "^18.2.0",
            "react-dom": "^18.2.0",
          },
        }}
      />
    </div>
  );
}
