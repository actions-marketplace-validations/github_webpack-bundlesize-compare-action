import * as core from '@actions/core'
import {context, getOctokit} from '@actions/github'
import {getCommentBody, getIdentifierComment} from './to-comment-body'
import getStatsDiff from './get-stats-diff'
import {parseStatsFileToJson} from './parse-stats-file-to-json'

async function run(): Promise<void> {
  try {
    if (
      context.eventName !== 'pull_request' &&
      context.eventName !== 'pull_request_target'
    ) {
      throw new Error(
        'This action only supports pull_request and pull_request_target events'
      )
    }
    const {
      issue: {number: issue_number},
      repo: {owner, repo: repo_name}
    } = context
    const token = core.getInput('github-token')
    const currentStatsJsonPath = core.getInput('current-stats-json-path')
    const baseStatsJsonPath = core.getInput('base-stats-json-path')
    const title = core.getInput('title') ?? ''
    const {rest} = getOctokit(token)

    const [currentStatsJson, baseStatsJson, {data: comments}] =
      await Promise.all([
        parseStatsFileToJson(currentStatsJsonPath),
        parseStatsFileToJson(baseStatsJsonPath),
        rest.issues.listComments({
          repo: repo_name,
          owner,
          issue_number
        })
      ])

    const identifierComment = getIdentifierComment(title)

    const [currentComment, ...restComments] = comments.filter(
      comment =>
        comment.user?.login === 'github-actions[bot]' &&
        comment.body &&
        comment.body.includes(identifierComment)
    )

    const statsDiff = getStatsDiff(baseStatsJson, currentStatsJson)

    const commentBody = getCommentBody(statsDiff, title)

    const promises: Promise<unknown>[] = []

    if (restComments.length > 1) {
      promises.push(
        ...restComments.map(async comment => {
          return rest.issues.deleteComment({
            repo: repo_name,
            owner,
            comment_id: comment.id
          })
        })
      )
    }

    if (currentComment) {
      promises.push(
        rest.issues.updateComment({
          issue_number,
          owner,
          repo: repo_name,
          body: commentBody,
          comment_id: currentComment.id
        })
      )
    } else {
      promises.push(
        rest.issues.createComment({
          issue_number,
          owner,
          repo: repo_name,
          body: commentBody
        })
      )
    }

    await Promise.all(promises)
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()