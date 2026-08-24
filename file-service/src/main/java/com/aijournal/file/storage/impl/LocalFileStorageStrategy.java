package com.aijournal.file.storage.impl;

import com.aijournal.common.exception.BadRequestException;
import com.aijournal.file.storage.FileStorageStrategy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

@Component("localStorageStrategy")
public class LocalFileStorageStrategy implements FileStorageStrategy {

    @Value("${storage.local.dir:./uploads}")
    private String uploadDir;

    @Override
    public String storeFile(MultipartFile file, String subPath) {
        try {
            Path targetDir = Paths.get(uploadDir, subPath);
            Files.createDirectories(targetDir);

            String originalFilename = file.getOriginalFilename();
            String fileExtension = originalFilename != null && originalFilename.contains(".") ?
                    originalFilename.substring(originalFilename.lastIndexOf(".")) : "";

            String fileName = UUID.randomUUID() + fileExtension;
            Path filePath = targetDir.resolve(fileName);

            // transferTo(Path), not transferTo(File) - the File overload resolves relative
            // to the servlet container's internal multipart temp location on some Tomcat
            // versions and silently fails for a destination outside it (target directory
            // gets created, but the file itself never gets written). The Path overload
            // copies via the part's InputStream instead, which works for any destination.
            file.transferTo(filePath);
            return subPath + "/" + fileName;

        } catch (IOException e) {
            throw new BadRequestException("Could not store file locally: " + e.getMessage());
        }
    }

    @Override
    public Resource getFile(String relativePath) {
        try {
            Path filePath = Paths.get(uploadDir, relativePath);
            Resource resource = new UrlResource(filePath.toUri());
            if (!resource.exists() || !resource.isReadable()) {
                throw new BadRequestException("File not found or unreadable: " + relativePath);
            }
            return resource;
        } catch (MalformedURLException e) {
            throw new BadRequestException("File not found or unreadable: " + relativePath);
        }
    }

    @Override
    public void deleteFile(String relativePath) {
        try {
            Path filePath = Paths.get(uploadDir, relativePath);
            Files.deleteIfExists(filePath);
        } catch (IOException e) {
            // Ignore deletion error
        }
    }

    @Override
    public void deleteDirectory(String subPath) {
        Path dir = Paths.get(uploadDir, subPath);
        if (!Files.isDirectory(dir)) {
            return;
        }
        try (var walk = Files.walk(dir)) {
            // Deepest paths first (files before their parent directories),
            // matching the standard delete-a-tree ordering - deleting a
            // directory before its contents are gone would fail.
            walk.sorted(java.util.Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException e) {
                    // Ignore deletion error, same graceful-degradation bar as deleteFile
                }
            });
        } catch (IOException e) {
            // Ignore - same graceful-degradation bar as deleteFile
        }
    }
}
