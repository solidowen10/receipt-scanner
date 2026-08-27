"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, Type } from "lucide-react";
import {
  renderFilenamePreview,
  TOKEN_LABELS,
  type FilenameSegment,
  type FilenameToken,
  type FilenameValues,
} from "@/lib/filename-template";

const TOKEN_OPTIONS = Object.entries(TOKEN_LABELS) as Array<[FilenameToken, string]>;
const SEPARATORS = ["_", "-", " ", "+", "OL"];

export default function FilenameBuilder({
  template,
  onChange,
  previewValues,
}: {
  template: FilenameSegment[];
  onChange: (template: FilenameSegment[]) => void;
  previewValues?: Partial<FilenameValues>;
}) {
  const addToken = (token: FilenameToken) => {
    onChange([...template, { id: makeId(), type: "token", token }]);
  };

  const addText = (value: string) => {
    onChange([...template, { id: makeId(), type: "text", value }]);
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = [...template];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const updateSegment = (index: number, segment: FilenameSegment) => {
    const next = [...template];
    next[index] = segment;
    onChange(next);
  };

  const removeSegment = (index: number) => {
    onChange(template.filter((_, current) => current !== index));
  };

  return (
    <div className="builder">
      <div className="builder-toolbar">
        <label className="field field-token">
          <span>Token</span>
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) addToken(event.target.value as FilenameToken);
              event.target.value = "";
            }}
          >
            <option value="">Add token</option>
            {TOKEN_OPTIONS.map(([token, label]) => (
              <option key={token} value={token}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="separator-row" aria-label="Fixed text shortcuts">
          {SEPARATORS.map((separator) => (
            <button key={separator} className="chip-button" type="button" onClick={() => addText(separator)}>
              <Plus size={14} />
              <span>{separator}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="segment-list">
        {template.map((segment, index) => (
          <div className="segment-row" key={segment.id}>
            <div className="segment-kind">
              {segment.type === "token" ? (
                <span className="token-pill">{TOKEN_LABELS[segment.token]}</span>
              ) : (
                <Type size={18} aria-label="Fixed text" />
              )}
            </div>

            {segment.type === "token" ? (
              <select
                value={segment.token}
                aria-label="Filename token"
                onChange={(event) => updateSegment(index, { ...segment, token: event.target.value as FilenameToken })}
              >
                {TOKEN_OPTIONS.map(([token, label]) => (
                  <option key={token} value={token}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={segment.value}
                aria-label="Fixed filename text"
                onChange={(event) => updateSegment(index, { ...segment, value: event.target.value })}
              />
            )}

            <div className="segment-actions">
              <button className="icon-button small" type="button" aria-label="Move up" onClick={() => move(index, -1)} disabled={index === 0}>
                <ArrowUp size={16} />
              </button>
              <button
                className="icon-button small"
                type="button"
                aria-label="Move down"
                onClick={() => move(index, 1)}
                disabled={index === template.length - 1}
              >
                <ArrowDown size={16} />
              </button>
              <button className="icon-button small danger" type="button" aria-label="Remove segment" onClick={() => removeSegment(index)}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="filename-preview">
        <span>Preview</span>
        <strong>{renderFilenamePreview(template, previewValues)}.jpg</strong>
      </div>
    </div>
  );
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
}
