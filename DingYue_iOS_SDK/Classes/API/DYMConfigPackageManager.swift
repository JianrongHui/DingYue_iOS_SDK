//
//  DYMConfigPackageManager.swift
//  DingYueMobileSDK
//

import Foundation
import SSZipArchive

enum DYMConfigPackageError: Error {
    case downloadFailed
    case invalidResponse
    case invalidZip
    case checksumMismatch
    case manifestMissing
    case manifestDecodeFailed
    case manifestMismatch
    case entryPathInvalid
    case entryNotFound
    case installFailed
}

final class DYMConfigPackageManager {
    struct InstallResult {
        let entryPath: String
        let entryDirectory: String
        let manifest: DYMConfigManifest
    }

    func downloadAndInstall(
        from url: URL,
        expectedChecksum: String?,
        expectedEntryPath: String?,
        expectedPackageVersion: String?,
        to rootPath: String,
        completion: @escaping (Result<InstallResult, DYMConfigPackageError>) -> Void
    ) {
        URLSession.shared.downloadTask(with: url) { tempUrl, response, error in
            if error != nil {
                completion(.failure(.downloadFailed))
                return
            }

            guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
                completion(.failure(.invalidResponse))
                return
            }

            guard let tempUrl = tempUrl else {
                completion(.failure(.downloadFailed))
                return
            }

            let fileManager = FileManager.default
            func cleanup(stagingPath: String? = nil) {
                if let stagingPath = stagingPath {
                    try? fileManager.removeItem(atPath: stagingPath)
                }
                try? fileManager.removeItem(at: tempUrl)
            }

            guard let zipData = try? Data(contentsOf: tempUrl) else {
                cleanup()
                completion(.failure(.invalidZip))
                return
            }

            let actualChecksum = DYMConfigCrypto.sha256Hex(zipData)
            if let expectedChecksum = normalizeChecksum(expectedChecksum), expectedChecksum != actualChecksum {
                cleanup()
                completion(.failure(.checksumMismatch))
                return
            }

            let stagingPath = rootPath + "_staging_" + UUID().uuidString
            let unzipSuccess = SSZipArchive.unzipFile(atPath: tempUrl.path, toDestination: stagingPath)
            if !unzipSuccess {
                cleanup(stagingPath: stagingPath)
                completion(.failure(.invalidZip))
                return
            }

            let manifestUrl = URL(fileURLWithPath: stagingPath).appendingPathComponent("manifest.json")
            guard let manifestData = try? Data(contentsOf: manifestUrl) else {
                cleanup(stagingPath: stagingPath)
                completion(.failure(.manifestMissing))
                return
            }

            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            guard let manifest = try? decoder.decode(DYMConfigManifest.self, from: manifestData) else {
                cleanup(stagingPath: stagingPath)
                completion(.failure(.manifestDecodeFailed))
                return
            }

            if let expectedPackageVersion = expectedPackageVersion, manifest.packageVersion != expectedPackageVersion {
                cleanup(stagingPath: stagingPath)
                completion(.failure(.manifestMismatch))
                return
            }

            let manifestEntryPath = normalizeEntryPath(manifest.entryPath)
            let expectedEntryPath = normalizeEntryPath(expectedEntryPath)
            if let expectedEntryPath = expectedEntryPath, expectedEntryPath != manifestEntryPath {
                cleanup(stagingPath: stagingPath)
                completion(.failure(.manifestMismatch))
                return
            }

            guard let entryPath = manifestEntryPath else {
                cleanup(stagingPath: stagingPath)
                completion(.failure(.entryPathInvalid))
                return
            }

            if expectedChecksum == nil, let manifestChecksum = normalizeChecksum(manifest.checksum), manifestChecksum != actualChecksum {
                cleanup(stagingPath: stagingPath)
                completion(.failure(.checksumMismatch))
                return
            }

            if let expectedChecksum = normalizeChecksum(expectedChecksum),
               let manifestChecksum = normalizeChecksum(manifest.checksum),
               expectedChecksum != manifestChecksum {
                cleanup(stagingPath: stagingPath)
                completion(.failure(.checksumMismatch))
                return
            }

            guard let entryFullPath = resolveEntryPath(entryPath, rootPath: stagingPath),
                  FileManager.default.fileExists(atPath: entryFullPath) else {
                cleanup(stagingPath: stagingPath)
                completion(.failure(.entryNotFound))
                return
            }

            let backupPath = rootPath + "_backup_" + UUID().uuidString
            do {
                if fileManager.fileExists(atPath: rootPath) {
                    try fileManager.moveItem(atPath: rootPath, toPath: backupPath)
                }
                try fileManager.moveItem(atPath: stagingPath, toPath: rootPath)
                if fileManager.fileExists(atPath: backupPath) {
                    try? fileManager.removeItem(atPath: backupPath)
                }
            } catch {
                if fileManager.fileExists(atPath: backupPath), !fileManager.fileExists(atPath: rootPath) {
                    try? fileManager.moveItem(atPath: backupPath, toPath: rootPath)
                }
                cleanup(stagingPath: stagingPath)
                completion(.failure(.installFailed))
                return
            }

            try? fileManager.removeItem(at: tempUrl)

            let finalEntryPath = URL(fileURLWithPath: rootPath).appendingPathComponent(entryPath).path
            let entryDirectory = URL(fileURLWithPath: finalEntryPath).deletingLastPathComponent().path
            completion(.success(InstallResult(entryPath: finalEntryPath, entryDirectory: entryDirectory, manifest: manifest)))
        }.resume()
    }

    private func normalizeChecksum(_ value: String?) -> String? {
        guard let value = value else { return nil }
        let lowercased = value.lowercased()
        if lowercased.hasPrefix("sha256:") {
            return String(lowercased.dropFirst("sha256:".count))
        }
        return lowercased
    }

    private func normalizeEntryPath(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: CharacterSet(charactersIn: "/")), !value.isEmpty else {
            return nil
        }
        let normalized = value.replacingOccurrences(of: "\\", with: "/")
        let components = normalized.split(separator: "/")
        if components.contains("..") {
            return nil
        }
        return components.joined(separator: "/")
    }

    private func resolveEntryPath(_ entryPath: String, rootPath: String) -> String? {
        let rootUrl = URL(fileURLWithPath: rootPath).standardizedFileURL
        let entryUrl = URL(fileURLWithPath: rootPath).appendingPathComponent(entryPath).standardizedFileURL
        guard entryUrl.path.hasPrefix(rootUrl.path) else { return nil }
        return entryUrl.path
    }
}
