const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer, isInstanceSuspended } = require('../../utils/authHelper.js');
const log = new (require('cat-loggr'))();
const { loadPlugins } = require('../../plugins/loadPls.js');
const path = require('path');
const fs = require('fs');
const schedule = require('node-schedule');
const axios = require('axios');

const plugins = loadPlugins(path.join(__dirname, '../../plugins'));

const workflowsFilePath = path.join(__dirname, '../../storage/workflows.json');
const scheduledWorkflowsFilePath = path.join(__dirname, '../../storage/scheduledWorkflows.json');

function saveWorkflowToFile(instanceId, workflow) {
    try {
        let workflows = {};

        if (fs.existsSync(workflowsFilePath)) {
            const data = fs.readFileSync(workflowsFilePath, 'utf8');
            workflows = JSON.parse(data);
        }

        workflows[instanceId] = workflow;

        fs.writeFileSync(workflowsFilePath, JSON.stringify(workflows, null, 2), 'utf8');
    } catch (error) {
        log.error('Error saving workflow to file:', error);
    }
}

function saveScheduledWorkflows() {
    try {
        const scheduledWorkflows = {};

        for (const job of Object.values(schedule.scheduledJobs)) {
            if (job.name.startsWith('job_')) {
                const instanceId = job.name.split('_')[1];
                scheduledWorkflows[instanceId] = job.nextInvocation();
            }
        }

        fs.writeFileSync(scheduledWorkflowsFilePath, JSON.stringify(scheduledWorkflows, null, 2), 'utf8');
    } catch (error) {
        log.error('Error saving scheduled workflows:', error);
    }
}

function loadScheduledWorkflows() {
    try {
        if (fs.existsSync(scheduledWorkflowsFilePath)) {
            const data = fs.readFileSync(scheduledWorkflowsFilePath, 'utf8');
            const scheduledWorkflows = JSON.parse(data);

            for (const [instanceId, nextInvocation] of Object.entries(scheduledWorkflows)) {
                const workflow = loadWorkflowFromFile(instanceId);
                if (workflow) {
                    scheduleWorkflowExecution(instanceId, workflow);
                }
            }
        }
    } catch (error) {
        log.error('Error loading scheduled workflows:', error);
    }
}

router.get("/instance/:id/automations", async (req, res) => {
    if (!req.user) return res.redirect('/');

    const { id } = req.params;
    if (!id) return res.redirect('../instances');

    const instance = await db.get(id + '_instance').catch(err => {
        log.error('Failed to fetch instance:', err);
        return null;
    });

    if (!instance) return res.status(404).send('Instance not found');

    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
    if (!isAuthorized) {
        return res.status(403).send('Unauthorized access to this instance.');
    }

    const suspended = await isInstanceSuspended(req.user.userId, instance, id);
    if (suspended === true) {
        return res.render('instance/suspended', { req, user: req.user });
    }

    let workflow = await db.get(id + '_workflow');
    if (!workflow) {
        workflow = loadWorkflowFromFile(id);
    }

    if (!workflow) {
        workflow = {};
    }

    const allPluginData = Object.values(plugins).map(plugin => plugin.config);

    res.render('instance/automations', {
        req,
        user: req.user,
        instance,
        workflow,
        addons: {
            plugins: allPluginData
        }
    });
});

router.post("/instance/:instanceId/automations/save-workflow", async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { instanceId } = req.params;
    const workflow = req.body;

    if (!instanceId || !workflow) {
        return res.status(400).json({ success: false, message: 'Missing required data' });
    }

    try {
        const instance = await db.get(instanceId + '_instance');
        if (!instance) {
            return res.status(404).json({ success: false, message: 'Instance not found' });
        }

        const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
        if (!isAuthorized) {
            return res.status(403).json({ success: false, message: 'Unauthorized access to this instance' });
        }

        const scheduledJob = schedule.scheduledJobs[`job_${instanceId}`];
        if (scheduledJob) {
            scheduledJob.cancel();
        }

        await db.set(instanceId + '_workflow', workflow);
        saveWorkflowToFile(instanceId, workflow);

        scheduleWorkflowExecution(instanceId, workflow);

        saveScheduledWorkflows();

        res.json({ success: true, message: 'Workflow saved successfully' });
    } catch (error) {
        log.error('Error saving workflow:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

function scheduleWorkflowExecution(instanceId, workflow) {
    const blocks = workflow.blocks;
    const intervalBlock = blocks.find(block => block.type === 'interval');

    if (intervalBlock) {
        const intervalMinutes = parseInt(intervalBlock.meta.selectedValue, 10);
        const rule = new schedule.RecurrenceRule();
        rule.minute = new schedule.Range(0, 59, intervalMinutes);

        const jobId = `job_${instanceId}`;

        const nextExecution = schedule.scheduleJob(jobId, rule, () => {
            executeWorkflow(instanceId);
            saveScheduledWorkflows();
        });

        logCountdownToNextExecution(nextExecution, intervalMinutes);
        setInterval(() => checkWorkflowValidity(instanceId, nextExecution), 5000);
    }
}

function logCountdownToNextExecution(scheduledJob, intervalMinutes) {
    const logInterval = setInterval(() => {
        const now = new Date();
        const nextDate = new Date(scheduledJob.nextInvocation());

        if (!isNaN(nextDate.getTime())) {
            const timeDiffMs = nextDate - now;
            const totalSecondsRemaining = Math.ceil(timeDiffMs / 1000);

            const minutesRemaining = Math.floor(totalSecondsRemaining / 60);
            const secondsRemaining = totalSecondsRemaining % 60;

            if (timeDiffMs > 0) {
                // Idk
            } else {
                clearInterval(logInterval);
            }
        } else {
            log.error('Invalid next execution time. Cannot calculate remaining time.');
            clearInterval(logInterval);
        }
    }, 5000);
}

async function checkWorkflowValidity(instanceId, scheduledJob) {
    const workflow = loadWorkflowFromFile(instanceId);
    if (!workflow) {
        scheduledJob.cancel();
    }
}

function executeWorkflow(instanceId) {
    const workflow = loadWorkflowFromFile(instanceId);

    if (workflow) {
        const blocks = workflow.blocks;

        blocks
            .filter(block => block.type === 'power')
            .forEach(block => {
                executePowerAction(instanceId, block.meta.selectedValue)
                    .then(success => {
                        if (success) {
                            const webhookBlock = blocks.find(b => b.type === 'webhook');
                            if (webhookBlock) {
                                sendWebhookNotification(webhookBlock.meta.inputValue, `Successfully executed power action: ${block.meta.selectedValue}`);
                            }
                        }
                    });
            });
    } else {
        log.error(`No workflow found for instance ${instanceId}`);
    }
}

async function executePowerAction(instanceId, powerAction) {
    try {
        const instance = await db.get(instanceId + '_instance');
        const response = await axios.post(
            `http://${instance.Node.address}:${instance.Node.port}/instances/${instance.ContainerId}/${powerAction}`, 
            {},
            {
                auth: { 
                    username: 'Skyport', 
                    password: instance.Node.apiKey 
                },
                headers: { 
                    'Content-Type': 'application/json' 
                }
            }
        );

        if (response.status === 200) {
            return true;
        } else if (response.status === 304) {
            return true;
        } else {
            log.error(`Unexpected status code: ${response.status}. Power action ${powerAction} might have failed.`);
            return false;
        }
    } catch (error) {
        if (error.response && error.response.status === 304) {
            return true;
        } else {
            log.error('Error executing power action:', error.message);
            return false;
        }
    }
}

async function sendWebhookNotification(webhookUrl, message) {
    try {
        await axios.post(webhookUrl, {
            content: message
        });
    } catch (error) {
        log.error('Failed to send webhook notification:', error.message);
    }
}

function loadWorkflowFromFile(instanceId) {
    try {
        if (fs.existsSync(workflowsFilePath)) {
            const data = fs.readFileSync(workflowsFilePath, 'utf8');
            const workflows = JSON.parse(data);
            return workflows[instanceId] || null;
        } else {
            return null;
        }
    } catch (error) {
        log.error('Error loading workflow from file:', error);
        return null;
    }
}

loadScheduledWorkflows();

module.exports = router;
