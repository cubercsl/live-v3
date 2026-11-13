package org.icpclive.admin

import io.ktor.server.application.*
import io.ktor.server.plugins.BadRequestException
import io.ktor.server.request.*
import kotlinx.serialization.SerializationException
import org.icpclive.server.ApiActionException

suspend inline fun <reified T> ApplicationCall.safeReceive(): T = try {
    receive()
} catch (error: BadRequestException) {
    throw ApiActionException("Failed to deserialize data: ${error.message}", error)
} catch (error: SerializationException) {
    throw ApiActionException("Failed to deserialize data: ${error.message}", error)
}
