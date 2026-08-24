package com.aijournal.file.validation;

import com.aijournal.common.exception.BadRequestException;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.Set;

// uploadFile() used to accept any MultipartFile at all - no MIME check, no
// extension check, no content sniffing - so a client could upload a .exe,
// .jsp, or .html (self-XSS-serving) payload as freely as a real photo. This
// enforces an allowlist of the attachment types this app actually supports
// (images, video, audio/voice notes, PDF), keyed on extension, cross-checked
// against the declared Content-Type, and - for the image/PDF types where
// this app's real feature (profile avatars, journal PDF attachments) makes
// spoofing most worth guarding against - the file's real magic bytes, so a
// relabeled/renamed payload can't just declare a fake Content-Type and slip
// through.
@Component
public class FileTypeValidator {

    private static final Map<String, Set<String>> ALLOWED_MIME_TYPES_BY_EXTENSION = Map.ofEntries(
            Map.entry("jpg", Set.of("image/jpeg")),
            Map.entry("jpeg", Set.of("image/jpeg")),
            Map.entry("png", Set.of("image/png")),
            Map.entry("gif", Set.of("image/gif")),
            Map.entry("webp", Set.of("image/webp")),
            Map.entry("pdf", Set.of("application/pdf")),
            Map.entry("mp4", Set.of("video/mp4")),
            Map.entry("mov", Set.of("video/quicktime")),
            Map.entry("webm", Set.of("video/webm", "audio/webm")),
            Map.entry("mp3", Set.of("audio/mpeg")),
            Map.entry("wav", Set.of("audio/wav", "audio/x-wav", "audio/wave")),
            Map.entry("ogg", Set.of("audio/ogg", "audio/wave"))
    );

    public void validate(MultipartFile file) {
        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null || !originalFilename.contains(".")) {
            throw new BadRequestException("File must have a recognizable extension");
        }
        String extension = originalFilename.substring(originalFilename.lastIndexOf('.') + 1).toLowerCase();
        Set<String> allowedMimeTypes = ALLOWED_MIME_TYPES_BY_EXTENSION.get(extension);
        if (allowedMimeTypes == null) {
            throw new BadRequestException("File type ." + extension + " is not allowed");
        }

        String declaredContentType = file.getContentType();
        if (declaredContentType == null || !allowedMimeTypes.contains(declaredContentType)) {
            throw new BadRequestException("Declared content type does not match an allowed type for ." + extension);
        }

        // Magic-byte check for the two families where this app has a real
        // upload feature today (profile avatars, PDF attachments) - video/
        // audio containers have too many valid signature variants to check
        // cheaply here, so those rely on the extension+MIME cross-check above.
        if (declaredContentType.startsWith("image/") || declaredContentType.equals("application/pdf")) {
            byte[] header = readHeaderBytes(file);
            if (!matchesKnownSignature(declaredContentType, header)) {
                throw new BadRequestException("File content does not match its declared type");
            }
        }
    }

    private byte[] readHeaderBytes(MultipartFile file) {
        try (InputStream in = file.getInputStream()) {
            byte[] header = new byte[12];
            int read = in.read(header);
            return read <= 0 ? new byte[0] : header;
        } catch (IOException e) {
            throw new BadRequestException("Could not read uploaded file: " + e.getMessage());
        }
    }

    private boolean matchesKnownSignature(String declaredContentType, byte[] header) {
        return switch (declaredContentType) {
            case "image/jpeg" -> startsWith(header, 0xFF, 0xD8, 0xFF);
            case "image/png" -> startsWith(header, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
            case "image/gif" -> startsWithAscii(header, "GIF87a") || startsWithAscii(header, "GIF89a");
            case "image/webp" -> startsWithAscii(header, "RIFF") && header.length >= 12
                    && header[8] == 'W' && header[9] == 'E' && header[10] == 'B' && header[11] == 'P';
            case "application/pdf" -> startsWithAscii(header, "%PDF-");
            default -> true;
        };
    }

    private boolean startsWith(byte[] header, int... expected) {
        if (header.length < expected.length) {
            return false;
        }
        for (int i = 0; i < expected.length; i++) {
            if ((header[i] & 0xFF) != expected[i]) {
                return false;
            }
        }
        return true;
    }

    private boolean startsWithAscii(byte[] header, String prefix) {
        if (header.length < prefix.length()) {
            return false;
        }
        for (int i = 0; i < prefix.length(); i++) {
            if (header[i] != (byte) prefix.charAt(i)) {
                return false;
            }
        }
        return true;
    }
}
