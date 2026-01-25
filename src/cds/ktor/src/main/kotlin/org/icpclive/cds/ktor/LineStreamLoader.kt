package org.icpclive.cds.ktor

import io.ktor.client.plugins.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.utils.io.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.withContext
import org.icpclive.cds.settings.UrlOrLocalPath
import org.icpclive.cds.util.getLogger

internal fun getLineFlow(networkSettings: NetworkSettings, url: UrlOrLocalPath): Flow<String> = channelFlow {
    when (url) {
        is UrlOrLocalPath.Local -> {
            withContext(Dispatchers.IO) {
                url.value.toFile().useLines { lines ->
                    for (line in lines) {
                        if (line.isEmpty()) continue
                        send(line)
                    }
                }
            }
        }

        is UrlOrLocalPath.Url -> {
            val httpClient = networkSettings.createHttpClient()
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
                    val line = channel.readLine() ?: continue
                    if (line.isEmpty()) continue
                    send(line)
                }
            }
        }
    }
}.catch { throw wrapIfSSLError(it) }


private val logger by getLogger()