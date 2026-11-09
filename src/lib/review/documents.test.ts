import { describe, expect, it } from "vitest";
import { applicationDocumentPath, candidateCvPath, cleanDocumentName, documentUrl, isDocumentKind, mockDocumentPath } from "./documents";

describe("cleanDocumentName", () => {
  it("keeps a plain name and adds .pdf", () => {
    expect(cleanDocumentName("Ana Novak CV.pdf", "cv")).toBe("Ana Novak CV.pdf");
    expect(cleanDocumentName("resume.PDF", "cv")).toBe("resume.pdf");
    expect(cleanDocumentName("resume", "cv")).toBe("resume.pdf");
  });

  it("drops folders, so a name can't climb out of its place", () => {
    expect(cleanDocumentName("C:\\Users\\ana\\Documents\\cv.pdf", "cv")).toBe("cv.pdf");
    expect(cleanDocumentName("../../etc/passwd.pdf", "cv")).toBe("passwd.pdf");
    expect(cleanDocumentName("a/b/c/letter.pdf", "cover-letter")).toBe("letter.pdf");
  });

  it("drops accents and anything unusual", () => {
    expect(cleanDocumentName("Đorđe Čačić – CV (final).pdf", "cv")).toBe("Djordje Cacic CV final.pdf");
    expect(cleanDocumentName("cv<script>alert(1)<script>.pdf", "cv")).toBe("cv script alert 1 script.pdf");
    expect(cleanDocumentName("cv\u0000\n\t.pdf", "cv")).toBe("cv.pdf");
  });

  it("never starts or ends with a dot or a dash", () => {
    expect(cleanDocumentName("..cv...pdf", "cv")).toBe("cv.pdf");
    expect(cleanDocumentName("-cv-.pdf", "cv")).toBe("cv.pdf");
    expect(cleanDocumentName(".pdf", "cv")).toBe("cv.pdf");
  });

  it("falls back to the kind when nothing is left", () => {
    expect(cleanDocumentName("", "cv")).toBe("cv.pdf");
    expect(cleanDocumentName("Петровић.pdf", "cover-letter")).toBe("cover-letter.pdf");
    expect(cleanDocumentName("!!!.pdf", "cv")).toBe("cv.pdf");
  });

  it("is at most 80 characters before the extension", () => {
    const name = cleanDocumentName(`${"a".repeat(200)}.pdf`, "cv");
    expect(name).toBe(`${"a".repeat(80)}.pdf`);
  });
});

describe("applicationDocumentPath", () => {
  it("keeps the application, the kind and the cleaned name, with the file name last", () => {
    const path = applicationDocumentPath("0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f", "cover-letter", "My Letter.pdf");
    expect(path).toBe("applications/0b2f4d6e-8a1c-4e3b-9d5f-7a1b2c3d4e5f/cover-letter/My Letter.pdf");
    expect(path.split("/").at(-1)).toBe("My Letter.pdf");
  });
});

describe("candidateCvPath", () => {
  it("keeps the candidate, the CV and the cleaned name, with the file name last", () => {
    const path = candidateCvPath("user-1", "3d6f8a1c-2b4e-4c5d-9e7f-1a2b3c4d5e6f", "../Ana Novák CV.pdf");
    expect(path).toBe("candidates/user-1/cvs/3d6f8a1c-2b4e-4c5d-9e7f-1a2b3c4d5e6f/Ana Novak CV.pdf");
  });

  it("falls back to cv.pdf for a name with nothing left", () => {
    expect(candidateCvPath("u", "c", "???.pdf")).toBe("candidates/u/cvs/c/cv.pdf");
  });
});

describe("the other helpers", () => {
  it("know the two kinds", () => {
    expect(isDocumentKind("cv")).toBe(true);
    expect(isDocumentKind("cover-letter")).toBe(true);
    expect(isDocumentKind("resume")).toBe(false);
  });

  it("build the route and the demo path", () => {
    expect(documentUrl("abc", "cv")).toBe("/api/applications/abc/documents/cv");
    expect(mockDocumentPath("ana-novak", "cv")).toBe("mock/ana-novak/cv.pdf");
  });
});
