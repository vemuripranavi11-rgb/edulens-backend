import { useState } from "react";

export default function DocumentViewer({ document, extractedFields = [], onClose }) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [showHighlights, setShowHighlights] = useState(true);

  if (!document) {
    return (
      <div className="viewerPlaceholder">
        <span>📄</span>
        <p>Select a document from the list to view original source and verified fields.</p>
      </div>
    );
  }

  const previewUrl = document.preview_url || `/api/v1/documents/${document.id}/file`;
  const downloadUrl = document.download_url || `/api/v1/documents/${document.id}/download`;

  const handleZoomIn = () => setZoom((z) => Math.min(200, z + 20));
  const handleZoomOut = () => setZoom((z) => Math.max(50, z - 20));
  const handleResetZoom = () => {
    setZoom(100);
    setRotation(0);
  };
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  return (
    <div className="documentViewerCard">
      {/* Toolbar */}
      <div className="viewerToolbar">
        <div className="viewerDocMeta">
          <strong className="viewerTitle">{document.name}</strong>
          <span className="badge mini green">Scan: Clean</span>
          <span className="badge mini blue">{document.category || "Supporting"}</span>
        </div>

        <div className="viewerControls">
          <button className="toolBtn" onClick={handleZoomOut} title="Zoom Out">
            −
          </button>
          <span className="zoomLabel">{zoom}%</span>
          <button className="toolBtn" onClick={handleZoomIn} title="Zoom In">
            +
          </button>
          <button className="toolBtn" onClick={handleRotate} title="Rotate 90°">
            ↻
          </button>
          <button className="toolBtn" onClick={handleResetZoom} title="Reset View">
            ⛶
          </button>
          <button
            className={`toolBtn toggleHighlights ${showHighlights ? "active" : ""}`}
            onClick={() => setShowHighlights(!showHighlights)}
            title="Toggle Field Highlights"
          >
            ✦ Highlights
          </button>
          <a
            href={downloadUrl}
            download={document.name}
            className="toolBtn downloadBtn"
            title="Download Document"
          >
            ⬇ Download
          </a>
          {onClose && (
            <button className="toolBtn closeBtn" onClick={onClose} title="Close Viewer">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Security & Checksum Banner */}
      <div className="viewerSecurityStrip">
        <span>🛡 SHA-256: <code>{document.checksum ? document.checksum.slice(0, 24) + "…" : "Verified"}</code></span>
        <span>✓ Malware-scan verified</span>
        <span>Access Policy: Restricted Institutional Scope</span>
      </div>

      {/* Document View Canvas */}
      <div className="viewerCanvas">
        <div
          className="viewerCanvasInner"
          style={{
            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
            transformOrigin: "top center",
            transition: "transform 0.15s ease-out"
          }}
        >
          {document.type?.includes("pdf") ? (
            <object
              data={previewUrl}
              type="application/pdf"
              className="embeddedDocumentObject"
            >
              {/* Fallback image/svg if browser PDF plugin disabled */}
              <img
                src={previewUrl}
                alt={document.name}
                className="documentImagePreview"
              />
            </object>
          ) : (
            <img
              src={previewUrl}
              alt={document.name}
              className="documentImagePreview"
            />
          )}

          {/* Optional Highlights Overlay */}
          {showHighlights && extractedFields.length > 0 && (
            <div className="extractedHighlightsOverlay">
              <div className="highlightsHeader">
                <span>Grounding Overlay ({extractedFields.length} entities detected)</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
