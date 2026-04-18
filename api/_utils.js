export function normalizeLimit(input) {
  const value = Number(input ?? 128);

  if (!Number.isInteger(value) || value < 8 || value > 500) {
    throw new Error("Limit must be an integer between 8 and 500.");
  }

  return value;
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }

  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;

      if (raw.length > 100_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    req.on("error", reject);
  });
}

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export function rejectNonPost(req, res) {
  if (req.method === "POST") {
    return false;
  }

  res.setHeader("Allow", "POST");
  sendJson(res, 405, { error: "Method not allowed." });
  return true;
}
