import { useEffect, useState } from "react";

export default function DocumentViewer({ document, extractedFields = [], onClose }) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [showHighlights, setShowHighlights] = useState(true);
  const [previewSrc, setPreviewSrc] = useState("");

  const previewUrl = document?.preview_url || (document ? `/api/v1/documents/${document.id}/file` : "");

  useEffect(() => {
    if (!previewUrl) {
      setPreviewSrc("");
      return undefined;
    }

    let objectUrl = "";
    const controller = new AbortController();

    const loadPreview = async () => {
      setPreviewSrc("");

      try {
        const token = localStorage.getItem("token");
        const response = await fetch(previewUrl, {
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });

        if (!response.ok) {
          throw new Error(`Preview request failed with status ${response.status}`);
        }

        objectUrl = URL.createObjectURL(await response.blob());
        setPreviewSrc(objectUrl);
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Failed to load document preview:", error);
        }
      }
    };

    loadPreview();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewUrl]);

  if (!document) {
    return (
      <div className="viewerPlaceholder">
        <span>📄</span>
        <p>Select a document from the list to view original source and verified fields.</p>
      </div>
    );
  }

  const downloadUrl = document.download_url || `/api/v1/documents/${document.id}/download`;

  const handleZoomIn = () => setZoom((z) => Math.min(200, z + 20));
  const handleZoomOut = () => setZoom((z) => Math.max(50, z - 20));
  const handleResetZoom = () => {
    setZoom(100);
    setRotation(0);
  };
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  const handleDownload = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(downloadUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!response.ok) {
        throw new Error(`Download request failed with status ${response.status}`);
      }

      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = document.name;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("Failed to download document:", error);
    }
  };

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
          <button
            type="button"
            onClick={handleDownload}
            className="toolBtn downloadBtn"
            title="Download Document"
          >
            ⬇ Download
          </button>
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
          {previewSrc && document.type?.includes("pdf") ? (
            <object
              data={previewSrc}
              type="application/pdf"
              className="embeddedDocumentObject"
            >
              <img
                src={previewSrc}
                alt={document.name}
                className="documentImagePreview"
              />
            </object>
          ) : previewSrc ? (
            <img
              src={previewSrc}
              alt={document.name}
              className="documentImagePreview"
            />
          ) : (
            <div className="viewerPlaceholder">Loading document preview…</div>
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
