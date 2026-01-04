//
//  EventReportManager.swift
//  DingYueMobileSDK
//
//  Created by 靖核 on 2022/2/25.
//

import Foundation

final class DYMEventManager {
    static let shared = DYMEventManager()
    private let reporter = DYMEventReporter()
    private init() {}
    
    func track(event name: String, extra: String? = nil, user: String? = nil) {
        reporter.enqueue(eventName: name, extra: extra, user: user)
    }
}
