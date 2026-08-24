package com.aijournal.file.validation;

import com.aijournal.common.exception.BadRequestException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FileTypeValidatorTest {

    private final FileTypeValidator validator = new FileTypeValidator();

    private static final byte[] REAL_PNG_HEADER =
            {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};
    private static final byte[] REAL_JPEG_HEADER = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0, 0, 0};
    private static final byte[] REAL_PDF_HEADER = "%PDF-1.7".getBytes();

    @Test
    void validate_RealPng_Passes() {
        MultipartFile file = new MockMultipartFile("file", "photo.png", "image/png", REAL_PNG_HEADER);

        assertThatCode(() -> validator.validate(file)).doesNotThrowAnyException();
    }

    @Test
    void validate_RealJpeg_Passes() {
        MultipartFile file = new MockMultipartFile("file", "photo.jpg", "image/jpeg", REAL_JPEG_HEADER);

        assertThatCode(() -> validator.validate(file)).doesNotThrowAnyException();
    }

    @Test
    void validate_RealPdf_Passes() {
        MultipartFile file = new MockMultipartFile("file", "doc.pdf", "application/pdf", REAL_PDF_HEADER);

        assertThatCode(() -> validator.validate(file)).doesNotThrowAnyException();
    }

    @Test
    void validate_DisallowedExtension_ThrowsBadRequest() {
        MultipartFile file = new MockMultipartFile("file", "payload.exe", "application/octet-stream", "MZ".getBytes());

        assertThatThrownBy(() -> validator.validate(file)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void validate_ScriptDisguisedWithImageExtension_ContentTypeMismatch_ThrowsBadRequest() {
        // A .jpg extension but a declared content type that isn't in the
        // allowlist for that extension (e.g. someone renamed a .html file
        // and forced a browser to send a mismatched Content-Type).
        MultipartFile file = new MockMultipartFile("file", "shell.jpg", "text/html", "<script>alert(1)</script>".getBytes());

        assertThatThrownBy(() -> validator.validate(file)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void validate_RealScriptRenamedWithImageExtensionAndSpoofedContentType_MagicByteCheckCatchesIt() {
        // Extension .jpg and declared Content-Type image/jpeg both look
        // legitimate, but the actual bytes are plaintext HTML, not a real
        // JPEG signature (FF D8 FF) - the magic-byte check must catch this
        // even though the extension+MIME cross-check alone would pass it.
        MultipartFile file = new MockMultipartFile("file", "shell.jpg", "image/jpeg", "<script>alert(1)</script>".getBytes());

        assertThatThrownBy(() -> validator.validate(file)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void validate_NoExtension_ThrowsBadRequest() {
        MultipartFile file = new MockMultipartFile("file", "noext", "image/png", REAL_PNG_HEADER);

        assertThatThrownBy(() -> validator.validate(file)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void validate_MissingContentType_ThrowsBadRequest() {
        MultipartFile file = new MockMultipartFile("file", "photo.png", null, REAL_PNG_HEADER);

        assertThatThrownBy(() -> validator.validate(file)).isInstanceOf(BadRequestException.class);
    }
}
