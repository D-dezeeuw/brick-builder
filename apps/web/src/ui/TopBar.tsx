import { useEditorStore } from '../state/editorStore';

export function TopBar() {
  const brickCount = useEditorStore((s) => s.bricks.size);
  return (
    <>
      <h1 className="title">Untitled Creation</h1>
      <div className="stats">
        <span>{brickCount} bricks</span>
      </div>
    </>
  );
}
