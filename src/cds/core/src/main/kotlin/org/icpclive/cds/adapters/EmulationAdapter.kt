@file:JvmMultifileClass
@file:JvmName("Adapters")

package org.icpclive.cds.adapters

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import org.icpclive.cds.*
import org.icpclive.cds.api.*
import org.icpclive.util.*
import kotlin.random.Random
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

internal class EmulationAdapter

private val logger = getLogger(EmulationAdapter::class)

internal fun Flow<ContestUpdate>.toEmulationFlow(startTime: Instant, emulationSpeed: Double) = flow {
    val scope = CoroutineScope(currentCoroutineContext())
    val waitProgress = MutableStateFlow<Pair<ContestStatus, Int>?>(null)
    val logJob = scope.launch {
        while (true) {
            delay(1.seconds)
            val r = waitProgress.value
            logger.info("Waiting for contest to become Finalized to start emulation. Current status is ${r?.first}. ${r?.second} runs are still in progress.")
        }
    }
    val state = finalContestState { state, count ->
        if (state != null) {
            waitProgress.value = state to count
        }
    }
    logJob.cancel()
    val finalContestInfo = state.infoAfterEvent!!
    val runs = state.runs.values.toList()
    val analyticsMessages = state.analyticsMessages.values.toList()
    logger.info("Running in emulation mode with speed x${emulationSpeed} and startTime = ${startTime.humanReadable}")
    val contestInfo = finalContestInfo.copy(
        startTime = startTime,
        emulationSpeed = emulationSpeed
    )

    emit(-Duration.INFINITE to InfoUpdate(contestInfo.copy(status = ContestStatus.BEFORE)))
    buildList {
        add(Duration.ZERO to InfoUpdate(contestInfo.copy(status = ContestStatus.RUNNING)))
        add(contestInfo.contestLength to InfoUpdate(contestInfo.copy(status = ContestStatus.OVER)))
        for (run in runs) {
            var percentage = Random.nextDouble(0.1)
            var timeShift = 0
            if (run.result !is RunResult.InProgress) {
                do {
                    val submittedRun = run.copy(
                        result = RunResult.InProgress(percentage)
                    )
                    add((run.time + timeShift.milliseconds) to RunUpdate(submittedRun))
                    percentage += Random.nextDouble(1.0)
                    timeShift += Random.nextInt(20000)
                } while (percentage < 1.0)
            }
            add((run.time + timeShift.milliseconds) to RunUpdate(run))
        }
        addAll(analyticsMessages.map { it.relativeTime to AnalyticsUpdate(it) })
    }.sortedBy { it.first }.forEach { emit(it) }
}.map { (startTime + it.first / emulationSpeed) to it.second }
    .toTimedFlow { logger.info("Processed events upto ${(it - startTime) * emulationSpeed}") }


private fun <T> Flow<Pair<Instant, T>>.toTimedFlow(log: (Instant) -> Unit = {}) : Flow<T> {
    var lastLoggedTime: Instant = Instant.DISTANT_PAST
    return map { (nextEventTime, item) ->
        delay(nextEventTime - Clock.System.now())
        if (nextEventTime - lastLoggedTime > 10.seconds) {
            log(nextEventTime)
            lastLoggedTime = nextEventTime
        }
        item
    }
}