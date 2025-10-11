package org.icpclive.cds.ktor

import io.ktor.client.plugins.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.client.plugins.websocket.*
import io.ktor.websocket.*
import io.ktor.utils.io.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import org.icpclive.cds.settings.UrlOrLocalPath
import org.icpclive.cds.util.getLogger

internal fun getLineFlow(networkSettings: NetworkSettings, url: UrlOrLocalPath): Flow<String> = flow {
    when (url) {
        is UrlOrLocalPath.Local -> {
            url.value.toFile().useLines { lines ->
                emitAll(lines.asFlow())
            }
        }

        is UrlOrLocalPath.Url -> {
            val httpClient = networkSettings.createHttpClient()
            if (url.value.startsWith("ws://") || url.value.startsWith("wss://")) {
                logger.info { "Connecting to websocket $url" }
                val session = httpClient.webSocketSession {
                    url(url.value)
                    timeout {
                        socketTimeoutMillis = Long.MAX_VALUE
                        requestTimeoutMillis = Long.MAX_VALUE
                    }
                    setupAuth(url.auth)
                }
                try {
                    for (frame in session.incoming) {
                        when (frame) {
                            is Frame.Text -> {
                                val text = frame.readText()
                                for (line in text.lineSequence()) {
                                    if (line.isEmpty()) continue
                                    emit(line)
                                }
                            }
                            is Frame.Binary -> {
                                val text = frame.readBytes().decodeToString()
                                for (line in text.lineSequence()) {
                                    if (line.isEmpty()) continue
                                    emit(line)
                                }
                            }
                            is Frame.Close -> break
                            else -> continue
                        }
                    }
                } finally {
                    session.close()
                }
            } else {
                logger.info { "Requesting $url" }
                httpClient.prepareGet(url.value) {
                    timeout {
                        socketTimeoutMillis = Long.MAX_VALUE
                        requestTimeoutMillis = Long.MAX_VALUE
                    }
                    setupAuth(url.auth)
                }.execute { httpResponse ->
                    if (httpResponse.status != HttpStatusCode.OK) {
                        logger.warning { "Got ${httpResponse.status} from $url" }
                        return@execute
                    }
                    val channel = httpResponse.bodyAsChannel()
                    while (!channel.isClosedForRead) {
                        val line = channel.readUTF8Line() ?: continue
                        if (line.isEmpty()) continue
                        emit(line)
                    }
                }
            }
        }
    }
}.catch { throw wrapIfSSLError(it) }


private val logger by getLogger()
