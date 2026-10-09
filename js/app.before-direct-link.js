const BACKEND_URL = "http://localhost:3000";

const packageInput = document.getElementById("packageInput");
const welcome = document.getElementById("welcome");
const packagePanel = document.getElementById("packagePanel");
const packageIdElement = document.getElementById("packageId");
const trustedUtcElement = document.getElementById("trustedUtc");
const utcStatusElement = document.getElementById("utcStatus");
const fileList = document.getElementById("fileList");
const messageElement = document.getElementById("message");
const reloadPackageButton = document.getElementById("reloadPackage");

let currentPackage = null;
let currentPackageFile = null;
let file6GateToken = null;
let file7GateToken = null;
let refreshTimer = null;

/*
 * Files become visible sequentially.
 *
 * 0 = File 1
 * 1 = File 2
 * 2 = File 3
 * ...
 * 6 = File 7
 */
let completedFiles = new Set();


/* ==================================================
   TRUSTED UTC
   ================================================== */

async function getTrustedUTC() {
    const response = await fetch(`${BACKEND_URL}/utc-now`);

    if (!response.ok) {
        throw new Error("Trusted UTC unavailable");
    }

    return await response.json();
}


async function checkBackend() {
    try {
        const data = await getTrustedUTC();

        utcStatusElement.textContent =
            `Trusted UTC Â· ${new Date(data.utc).toISOString()}`;

    } catch (error) {
        utcStatusElement.textContent =
            "Trusted UTC unavailable";
    }
}


/* ==================================================
   MESSAGE
   ================================================== */

function showMessage(text) {
    messageElement.textContent = text;
    messageElement.classList.remove("hidden");
}


function hideMessage() {
    messageElement.classList.add("hidden");
    messageElement.textContent = "";
}


/* ==================================================
   COUNTDOWN
   ================================================== */

function formatCountdown(milliseconds) {
    if (milliseconds <= 0) {
        return "00:00:00";
    }

    const totalSeconds =
        Math.ceil(milliseconds / 1000);

    const hours =
        Math.floor(totalSeconds / 3600);

    const minutes =
        Math.floor((totalSeconds % 3600) / 60);

    const seconds =
        totalSeconds % 60;

    return [
        String(hours).padStart(2, "0"),
        String(minutes).padStart(2, "0"),
        String(seconds).padStart(2, "0")
    ].join(":");
}


/* ==================================================
   PACKAGE STATUS
   ================================================== */

async function loadPackageStatus() {
    if (!currentPackage) {
        return;
    }

    try {
        const response = await fetch(
            `${BACKEND_URL}/package/${currentPackage.packageId}`
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(
                data.error ||
                "Unable to load package"
            );
        }

        currentPackageFile = data;

        trustedUtcElement.textContent =
            new Date(data.trustedUTC).toISOString();

        renderFiles(data);

    } catch (error) {
        showMessage(error.message);
    }
}


/* ==================================================
   RENDER FILE LIST
   ================================================== */

function renderFiles(packageStatus) {
    fileList.innerHTML = "";

    const trustedTime =
        new Date(packageStatus.trustedUTC).getTime();


    packageStatus.files.forEach((file, index) => {

        /*
         * Sequential visibility:
         *
         * File 1 is always visible.
         * File 2 becomes visible only after File 1
         * has actually been opened.
         *
         * File 3 after File 2, etc.
         */

        const previousCompleted =
            index === 0 ||
            completedFiles.has(index - 1);


        const card =
            document.createElement("div");

        card.className =
            "file-card";


        const top =
            document.createElement("div");

        top.className =
            "file-top";


        const name =
            document.createElement("div");

        name.className =
            "file-name";

        name.textContent =
            file.name;


        const status =
            document.createElement("div");


        /*
         * If previous file hasn't been completed,
         * don't show its UTC timer at all.
         */

        if (!previousCompleted) {

            status.className =
                "file-status locked";

            status.textContent =
                "WAITING";

            top.appendChild(name);
            top.appendChild(status);

            card.appendChild(top);

            fileList.appendChild(card);

            return;
        }


        const unlockTime =
            new Date(file.unlockAt).getTime();

        const unlocked =
            trustedTime >= unlockTime;


        status.className =
            `file-status ${
                unlocked ? "unlocked" : "locked"
            }`;

        status.textContent =
            unlocked ? "UNLOCKED" : "LOCKED";


        top.appendChild(name);
        top.appendChild(status);

        card.appendChild(top);


        const countdown =
            document.createElement("div");

        countdown.className =
            "countdown";


        if (unlocked) {

            countdown.textContent =
                "READY";

        } else {

            countdown.textContent =
                formatCountdown(
                    unlockTime - trustedTime
                );
        }


        card.appendChild(countdown);


        const meta =
            document.createElement("div");

        meta.className =
            "meta";

        meta.textContent =
            `${file.mimeType || "unknown"} Â· ` +
            `${file.size ?? "?"} bytes Â· ` +
            `${file.encoding || "unknown"}`;

        card.appendChild(meta);


        if (unlocked) {

            const openButton =
                document.createElement("button");

            openButton.className =
                "open-button";

            openButton.textContent =
                "OPEN";


            openButton.addEventListener(
                "click",
                () => openFile(file, index)
            );


            card.appendChild(
                openButton
            );
        }


        fileList.appendChild(
            card
        );
    });
}


/* ==================================================
   LOCAL RETRY LOCK
   ================================================== */

function getLockKey(index) {

    if (!currentPackage) {
        return null;
    }

    return (
        `UTC_LOCK_` +
        `${currentPackage.packageId}_` +
        `${index}`
    );
}


function getRetryLock(index) {

    const key =
        getLockKey(index);

    if (!key) {
        return 0;
    }

    const value =
        localStorage.getItem(key);

    if (!value) {
        return 0;
    }

    const timestamp =
        Number(value);

    if (
        !Number.isFinite(timestamp) ||
        Date.now() >= timestamp
    ) {

        localStorage.removeItem(key);

        return 0;
    }

    return timestamp;
}


function setRetryLock(
    index,
    milliseconds
) {

    const key =
        getLockKey(index);

    if (!key) {
        return;
    }

    localStorage.setItem(
        key,
        String(
            Date.now() +
            milliseconds
        )
    );
}


function formatRemainingLock(
    timestamp
) {

    const remaining =
        Math.max(
            0,
            timestamp - Date.now()
        );

    const totalSeconds =
        Math.ceil(
            remaining / 1000
        );

    const minutes =
        Math.floor(
            totalSeconds / 60
        );

    const seconds =
        totalSeconds % 60;

    return (
        `${minutes}m ` +
        `${String(seconds).padStart(2, "0")}s`
    );
}


/* ==================================================
   OPEN FILE
   ================================================== */

async function openFile(
    file,
    index
) {

    if (!currentPackage) {
        return;
    }

    hideMessage();


    /*
     * File-specific gate
     */

    const passed =
        await runFileGate(index);

    if (!passed) {
        return;
    }


    try {

        const decryptHeaders = {};

        if (index === 5 && file6GateToken) {
            decryptHeaders["x-utc-gate-token"] = file6GateToken;
        }

        if (index === 6 && file7GateToken) {
            decryptHeaders["x-utc-gate-token"] = file7GateToken;
        }

        const response =
            await fetch(
                `${BACKEND_URL}/package/` +
                `${currentPackage.packageId}` +
                `/file/` +
                `${file.fileId}`,
                {
                    headers: decryptHeaders
                }
            );


        const data =
            await response.json();


        if (!response.ok || !data.ok) {

            throw new Error(
                data.message ||
                data.error ||
                "File could not be opened"
            );
        }


        /*
         * The file is considered completed only
         * after the decrypted content has been
         * successfully rendered.
         */

        displayDecryptedFile(
            data,
            file,
            index
        );


    } catch (error) {

        showMessage(
            error.message
        );
    }
}


/* ==================================================
   FILE GATE ROUTER
   ================================================== */

async function runFileGate(index) {

    switch (index) {

        case 0:
            return await fileOneGate();

        case 1:
            return await fileTwoGate();

        case 2:
            return await fileThreeGate();

        case 3:
            return await fileFourGate();

        case 4:
            return await fileFiveGate();

        case 5:
            return await fileSixGate();

        case 6:
            return await fileSevenGate();

        default:
            return true;
    }
}


/* ==================================================
   GENERIC GATE VIEW
   ================================================== */

function createGateViewer(
    titleText,
    questionText
) {

    const existingViewer =
        document.getElementById(
            "utcFileViewer"
        );

    if (existingViewer) {
        existingViewer.remove();
    }


    const viewer =
        document.createElement("section");

    viewer.id =
        "utcFileViewer";

    viewer.className =
        "utc-file-viewer";


    const title =
        document.createElement("div");

    title.className =
        "utc-viewer-title";

    title.textContent =
        titleText;

    viewer.appendChild(
        title
    );


    const question =
        document.createElement("div");

    question.style.marginTop =
        "25px";

    question.style.marginBottom =
        "22px";

    question.style.fontSize =
        "18px";

    question.style.lineHeight =
        "1.7";

    question.style.color =
        "#eeeeee";

    question.textContent =
        questionText;

    viewer.appendChild(
        question
    );


    const options =
        document.createElement("div");

    options.style.display =
        "grid";

    options.style.gap =
        "10px";


    viewer.appendChild(
        options
    );


    const backButton =
        document.createElement("button");

    backButton.className =
        "secondary-button";

    backButton.style.marginTop =
        "24px";

    backButton.textContent =
        "BACK TO FILES";


    backButton.addEventListener(
        "click",
        () => {

            viewer.remove();

            packagePanel.classList.remove(
                "hidden"
            );

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        }
    );


    viewer.appendChild(
        backButton
    );


    packagePanel.classList.add(
        "hidden"
    );


    document
        .querySelector(".app")
        .appendChild(
            viewer
        );


    viewer.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });


    return {
        viewer,
        options
    };
}


/* ==================================================
   FILE 1
   ================================================== */

function fileOneGate() {

    return new Promise(resolve => {

        const gate =
            createGateViewer(
                "A small question before the first one.",
                "Please enter the nickname the sender used to call you."
            );


        const choices = [
            "Sania",
            "Manya",
            "Tmater",
            "My Love"
        ];


        choices.forEach(
            (choice, index) => {

                const button =
                    document.createElement(
                        "button"
                    );

                button.className =
                    "open-button";

                button.textContent =
                    `${index + 1}. ${choice}`;


                button.addEventListener(
                    "click",
                    () => {

                        if (
                            choice === "Tmater"
                        ) {

                            gate.viewer.remove();

                            packagePanel.classList.add(
                                "hidden"
                            );

                            resolve(true);

                            return;
                        }


                        showWrongAnswer(
                            gate.options,
                            "That is not the right answer."
                        );
                    }
                );


                gate.options.appendChild(
                    button
                );
            }
        );
    });
}


/* ==================================================
   FILE 2
   ================================================== */

function fileTwoGate() {

    return new Promise(resolve => {

        const lock =
            getRetryLock(1);


        if (lock > 0) {

            showLockScreen(
                "File 2 is temporarily locked.",
                `Try again in ${formatRemainingLock(lock)}.`,
                resolve
            );

            return;
        }


        const gate =
            createGateViewer(
                "SECOND",
                "CHOOSE YOUR favorite sentence."
            );


        const choices = [
            "Patak ke le lungi",
            "Maar dungi",
            "Thappad padega",
            "Jyada nahi ho raha hai"
        ];


        choices.forEach(
            (choice, index) => {

                const button =
                    document.createElement(
                        "button"
                    );

                button.className =
                    "open-button";

                button.textContent =
                    `${index + 1}. ${choice}`;


                button.addEventListener(
                    "click",
                    () => {

                        if (
                            choice === "Maar dungi"
                        ) {

                            gate.viewer.remove();

                            packagePanel.classList.add(
                                "hidden"
                            );

                            resolve(true);

                            return;
                        }


                        setRetryLock(
                            1,
                            60 * 1000
                        );


                        showLockScreen(
                            "Wrong answer.",
                            "File 2 is locked for 1 minute.",
                            resolve
                        );
                    }
                );


                gate.options.appendChild(
                    button
                );
            }
        );
    });
}


/* ==================================================
   FILE 3
   ================================================== */

function fileThreeGate() {

    return new Promise(resolve => {

        const gate =
            createGateViewer(
                "THIRD",
                "Open it, I can't make you wait; you're my jaan; even if you chose me as an option, open it dear."
            );


        const button =
            document.createElement(
                "button"
            );

        button.className =
            "open-button";

        button.textContent =
            "OPEN";


        button.addEventListener(
            "click",
            async () => {

                gate.viewer.remove();

                packagePanel.classList.add(
                    "hidden"
                );

                resolve(true);
            }
        );


        gate.options.appendChild(
            button
        );
    });
}


/* ==================================================
   FILE 4
   ================================================== */

function fileFourGate() {

    return new Promise(resolve => {

        const gate =
            createGateViewer(
                "FOURTH",
                "Meri life ka pehla word jo darr-darr kar maine tumhe bola; tumse woh kisi se nahi bola kyunki koi aisa tha hi nahi."
            );


        const instruction =
            document.createElement(
                "div"
            );

        instruction.style.marginBottom =
            "18px";

        instruction.style.color =
            "#888";

        instruction.style.fontSize =
            "13px";

        instruction.style.lineHeight =
            "1.7";

        instruction.textContent =
            "Please enter right key (right key I love u).";

        gate.options.appendChild(
            instruction
        );


        const choices = [
            "I miss u",
            "I love u",
            "I want to hug u",
            "I hate u"
        ];


        choices.forEach(
            (choice, index) => {

                const button =
                    document.createElement(
                        "button"
                    );

                button.className =
                    "open-button";

                button.textContent =
                    `${index + 1}. ${choice}`;


                button.addEventListener(
                    "click",
                    () => {

                        if (
                            choice === "I love u"
                        ) {

                            gate.viewer.remove();

                            packagePanel.classList.add(
                                "hidden"
                            );

                            resolve(true);

                            return;
                        }


                        showWrongAnswer(
                            gate.options,
                            "That is not the right key."
                        );
                    }
                );


                gate.options.appendChild(
                    button
                );
            }
        );
    });
}


/* ==================================================
   FILE 5
   ================================================== */

function fileFiveGate() {

    return new Promise(resolve => {

        const lock =
            getRetryLock(4);


        if (lock > 0) {

            showLockScreen(
                "File 5 is temporarily locked.",
                `Try again in ${formatRemainingLock(lock)}.`,
                resolve
            );

            return;
        }


        const gate =
            createGateViewer(
                "FIFTH",
                "Main tumse kya chahta tha?"
            );


        const choices = [
            "Kiss",
            "Sex",
            "Hug",
            "Kuch bhi nahi"
        ];


        choices.forEach(
            (choice, index) => {

                const button =
                    document.createElement(
                        "button"
                    );

                button.className =
                    "open-button";

                button.textContent =
                    `${index + 1}. ${choice}`;


                button.addEventListener(
                    "click",
                    () => {

                        if (
                            choice === "Hug"
                        ) {

                            gate.viewer.remove();

                            packagePanel.classList.add(
                                "hidden"
                            );

                            resolve(true);

                            return;
                        }


                        setRetryLock(
                            4,
                            30 * 60 * 1000
                        );


                        showLockScreen(
                            "Wrong answer.",
                            "File 5 is locked for 30 minutes.",
                            resolve
                        );
                    }
                );


                gate.options.appendChild(
                    button
                );
            }
        );
    });
}


/* ==================================================
   FILE 6
   ================================================== */

async function fileSixGate() {

    const q1 =
        await fileSixQuestionOne();

    if (!q1) {
        return false;
    }


    const q2 =
        await fileSixQuestionTwo();

    if (!q2) {
        return false;
    }


    const q3 =
        await fileSixQuestionThree();

    return q3;
}


/* ==================================================
   FILE 6 â€” QUESTION 1
   ================================================== */

function fileSixQuestionOne() {

    return new Promise(resolve => {

        const gate =
            createGateViewer(
                "SIXTH Â· 01",
                "Kya tum mere sath time pass kar rahe the?"
            );


        const choices = [
            "YES",
            "NO"
        ];


        choices.forEach(
            choice => {

                const button =
                    document.createElement(
                        "button"
                    );

                button.className =
                    "open-button";

                button.textContent =
                    choice;


                button.addEventListener(
                    "click",
                    () => {

                        if (
                            choice === "NO"
                        ) {

                            gate.viewer.remove();

                            packagePanel.classList.add(
                                "hidden"
                            );

                            resolve(true);

                            return;
                        }


                        showWrongAnswer(
                            gate.options,
                            "Think again."
                        );
                    }
                );


                gate.options.appendChild(
                    button
                );
            }
        );
    });
}


/* ==================================================
   FILE 6 â€” QUESTION 2
   ================================================== */

function fileSixQuestionTwo() {

    return new Promise(resolve => {

        const gate =
            createGateViewer(
                "SIXTH Â· 02",
                "Tum mujhse kyun baat karte the?"
            );


        const choices = [
            "relationship aage badhana tha",
            "time pass kar rahi thi",
            "as an option rakha tha",
            "pta ni"
        ];


        choices.forEach(
            (choice, index) => {

                const button =
                    document.createElement(
                        "button"
                    );

                button.className =
                    "open-button";

                button.textContent =
                    `${index + 1}. ${choice}`;


                button.addEventListener(
                    "click",
                    () => {

                        if (
                            choice ===
                            "as an option rakha tha"
                        ) {

                            gate.viewer.remove();

                            packagePanel.classList.add(
                                "hidden"
                            );

                            resolve(true);

                            return;
                        }


                        showWrongAnswer(
                            gate.options,
                            "Think again."
                        );
                    }
                );


                gate.options.appendChild(
                    button
                );
            }
        );
    });
}


/* ==================================================
   FILE 6 â€” QUESTION 3
   ================================================== */

function fileSixQuestionThree() {

    return new Promise(resolve => {

        const gate = createGateViewer(
            "SIXTH Â· 03",
            "Think carefully before answering this, because if you get it wrong, this message will remain locked forever."
        );

        const input = document.createElement("input");
        input.type = "text";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.placeholder = "Enter the answer";

        input.style.width = "100%";
        input.style.padding = "13px";
        input.style.marginTop = "5px";
        input.style.marginBottom = "12px";
        input.style.border = "1px solid rgba(255,255,255,0.16)";
        input.style.borderRadius = "6px";
        input.style.background = "rgba(255,255,255,0.04)";
        input.style.color = "#fff";
        input.style.outline = "none";

        gate.options.appendChild(input);

        const button = document.createElement("button");
        button.className = "open-button";
        button.textContent = "CHECK";

        button.addEventListener("click", async () => {

            const answer = input.value.trim();

            if (!answer) {
                showWrongAnswer(gate.options, "Enter the answer.");
                return;
            }

            button.disabled = true;
            button.textContent = "VERIFYING...";

            try {

                const response = await fetch(
                    `${BACKEND_URL}/package/${currentPackage.packageId}/file/${currentPackage.files[5].fileId}/gate/verify`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            answer: answer
                        })
                    }
                );

                const data = await response.json();

                if (
                    !response.ok ||
                    !data.ok ||
                    data.status !== "AUTHORIZED"
                ) {
                    button.disabled = false;
                    button.textContent = "CHECK";

                    showWrongAnswer(
                        gate.options,
                        "Do not reveal the file."
                    );

                    return;
                }

                file6GateToken = data.gateToken;

                gate.viewer.remove();
                packagePanel.classList.add("hidden");

                resolve(true);

            } catch (error) {

                button.disabled = false;
                button.textContent = "CHECK";

                showWrongAnswer(
                    gate.options,
                    "Gate verification failed."
                );
            }
        });

        gate.options.appendChild(button);

        setTimeout(() => input.focus(), 50);
    });
}


/* ==================================================
   FILE 7
   ================================================== */

function fileSevenGate() {

    return new Promise(resolve => {

        const gate =
            createGateViewer(
                "INSTAGRAM ALL CHAT",
                "The key is hidden in the questions before this one. Think. Search your memory. Then enter the key to unlock it."
            );


        const input =
            document.createElement(
                "input"
            );


        input.type =
            "text";

        input.autocomplete =
            "off";

        input.spellcheck =
            false;

        input.placeholder =
            "Enter the hidden key";


        input.style.width =
            "100%";

        input.style.padding =
            "13px";

        input.style.marginTop =
            "5px";

        input.style.marginBottom =
            "12px";

        input.style.border =
            "1px solid rgba(255,255,255,0.16)";

        input.style.borderRadius =
            "6px";

        input.style.background =
            "rgba(255,255,255,0.04)";

        input.style.color =
            "#fff";

        input.style.outline =
            "none";


        gate.options.appendChild(
            input
        );


        const button =
            document.createElement(
                "button"
            );

        button.className =
            "open-button";

        button.textContent =
            "UNLOCK";


        button.addEventListener(
            "click",
            async () => {

                const answer =
                    input.value.trim();

                if (!answer) {
                    showWrongAnswer(
                        gate.options,
                        "Enter the hidden key."
                    );
                    return;
                }

                button.disabled = true;
                button.textContent = "VERIFYING...";

                try {

                    const file =
                        currentPackage.files[6];

                    if (!file) {
                        throw new Error(
                            "File 7 not found in package."
                        );
                    }

                    const response =
                        await fetch(
                            `${BACKEND_URL}/package/${currentPackage.packageId}/file/${file.fileId}/gate/file7/verify`,
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type":
                                        "application/json"
                                },
                                body: JSON.stringify({
                                    answer
                                })
                            }
                        );

                    const data =
                        await response.json();

                    if (
                        !response.ok ||
                        !data.ok ||
                        !data.gateToken
                    ) {
                        button.disabled = false;
                        button.textContent = "UNLOCK";

                        showWrongAnswer(
                            gate.options,
                            data.message ||
                                "The key is not correct."
                        );

                        return;
                    }

                    file7GateToken =
                        data.gateToken;

                    gate.viewer.remove();

                    packagePanel.classList.add(
                        "hidden"
                    );

                    resolve(true);

                } catch (error) {

                    console.error(
                        "File 7 gate error:",
                        error
                    );

                    button.disabled = false;
                    button.textContent = "UNLOCK";

                    showWrongAnswer(
                        gate.options,
                        "Gate verification failed."
                    );
                }
            }
        );


        gate.options.appendChild(
            button
        );


        setTimeout(
            () => input.focus(),
            50
        );
    });
}


/* ==================================================
   WRONG ANSWER
   ================================================== */

function showWrongAnswer(
    container,
    text
) {

    const existing =
        container.querySelector(
            ".gate-error"
        );


    if (existing) {
        existing.remove();
    }


    const error =
        document.createElement(
            "div"
        );

    error.className =
        "gate-error";

    error.style.marginTop =
        "16px";

    error.style.color =
        "#777";

    error.style.fontSize =
        "12px";

    error.style.lineHeight =
        "1.6";

    error.textContent =
        text;


    container.appendChild(
        error
    );
}


/* ==================================================
   LOCK SCREEN
   ================================================== */

function showLockScreen(
    titleText,
    messageText,
    resolve
) {

    const gate =
        createGateViewer(
            titleText,
            messageText
        );


    const button =
        document.createElement(
            "button"
        );

    button.className =
        "secondary-button";

    button.textContent =
        "BACK TO FILES";


    button.addEventListener(
        "click",
        () => {

            gate.viewer.remove();

            packagePanel.classList.remove(
                "hidden"
            );

            resolve(false);
        }
    );


    gate.options.appendChild(
        button
    );
}


/* ==================================================
   DISPLAY DECRYPTED FILE
   ================================================== */

function renderUtcMemoryManifest(manifest, viewer) {
    const wrap = document.createElement("div");
    wrap.className = "utc-memory-manifest";

    const items = Array.isArray(manifest?.items) ? manifest.items : [];

    if (!items.length) {
        const empty = document.createElement("div");
        empty.textContent = "This memory has no content.";
        wrap.appendChild(empty);
        return wrap;
    }

    items.forEach((item, itemIndex) => {
        const block = document.createElement("div");
        block.className = "utc-memory-item";

        const label = document.createElement("div");
        label.className = "utc-memory-item-title";
        label.textContent = item.name || ("Memory item " + (itemIndex + 1));
        block.appendChild(label);

        const mime = String(item.mimeType || "application/octet-stream").toLowerCase();

        if (item.encoding === "utf8") {
            const text = document.createElement("pre");
            text.className = "utc-text-viewer";
            text.textContent = String(item.data ?? "");
            block.appendChild(text);
        } else if (item.encoding === "base64" && item.data) {
            try {
                const bytes = base64ToUint8Array(item.data);
                const blob = new Blob([bytes], { type: mime });
                const url = URL.createObjectURL(blob);
                const fakeFile = { name: item.name || "file", mimeType: mime };
                const element = createViewerElement(mime, url, { contentBase64: item.data }, fakeFile);
                block.appendChild(element);
            } catch (error) {
                const fail = document.createElement("div");
                fail.textContent = "Unable to display this memory item.";
                block.appendChild(fail);
            }
        }

        wrap.appendChild(block);
    });

    return wrap;
}

function displayDecryptedFile(
    data,
    file,
    index
) {

    const existingViewer =
        document.getElementById(
            "utcFileViewer"
        );


    if (existingViewer) {
        existingViewer.remove();
    }


    const viewer =
        document.createElement(
            "section"
        );

    viewer.id =
        "utcFileViewer";

    viewer.className =
        "utc-file-viewer";


    const title =
        document.createElement(
            "div"
        );

    title.className =
        "utc-viewer-title";

    title.textContent =
        file.name;

    viewer.appendChild(
        title
    );


    const closeButton =
        document.createElement(
            "button"
        );

    closeButton.className =
        "secondary-button";

    closeButton.textContent =
        "BACK TO FILES";


    closeButton.addEventListener(
        "click",
        () => {

            viewer.remove();

            packagePanel.classList.remove(
                "hidden"
            );

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        }
    );


    viewer.appendChild(
        closeButton
    );


    /*
     * UTC MEMORY MANIFEST
     * One encrypted package file can contain
     * multiple memory items.
     */
    try {
        const decodedManifest =
            new TextDecoder("utf-8").decode(
                base64ToUint8Array(data.contentBase64)
            );

        const manifest = JSON.parse(decodedManifest);

        if (
            manifest &&
            manifest.format === "UTC_MEMORY" &&
            Array.isArray(manifest.items)
        ) {
            viewer.appendChild(
                renderUtcMemoryManifest(manifest, viewer)
            );

            if (index !== undefined) {
                completedFiles.add(index);
                if (currentPackageFile) {
                    renderFiles(currentPackageFile);
                }
            }

            packagePanel.classList.add("hidden");
            return;
        }
    } catch (error) {
        /* Normal encrypted file; continue below. */
    }

    const bytes =
        base64ToUint8Array(
            data.contentBase64
        );


    const mimeType =
        data.mimeType ||
        file.mimeType ||
        guessMimeTypeFromFilename(
            file.name
        );


    const blob =
        new Blob(
            [bytes],
            {
                type: mimeType
            }
        );


    const url =
        URL.createObjectURL(blob);


    const content =
        createViewerElement(
            mimeType,
            url,
            data,
            file
        );


    viewer.appendChild(
        content
    );


    /*
     * File-specific note after File 5.
     */

    if (index === 4) {

        const note =
            document.createElement(
                "div"
            );

        note.style.marginTop =
            "24px";

        note.style.padding =
            "18px";

        note.style.border =
            "1px solid rgba(255,255,255,0.08)";

        note.style.borderRadius =
            "8px";

        note.style.color =
            "#888";

        note.style.fontSize =
            "13px";

        note.style.lineHeight =
            "1.8";

        note.textContent =
            "tumhe ab tak preshan kar rha thaâ€¦ ab yahan wo convo hai jo tumhe mujhse chahiyeâ€¦ ab baaki do files ke liye ek hi chance ko lightly mat lena.";

        viewer.appendChild(
            note
        );
    }


    /*
     * Only now is this file considered completed.
     */

    if (
        index !== undefined
    ) {

        completedFiles.add(
            index
        );

        /*
         * Re-render list so the NEXT file's
         * actual UTC timer becomes visible.
         */

        if (currentPackageFile) {

            renderFiles(
                currentPackageFile
            );
        }
    }


    packagePanel.classList.add(
        "hidden"
    );


    document
        .querySelector(".app")
        .appendChild(
            viewer
        );


    viewer.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


/* ==================================================
   FILE RENDERER
   ================================================== */

function createViewerElement(
    mimeType,
    url,
    data,
    file
) {

    const normalizedMime =
        String(mimeType || "")
            .toLowerCase()
            .split(";")[0]
            .trim();


    const fileName =
        String(file?.name || "")
            .toLowerCase();


    /*
     * TEXT
     */

    const isTextFile =
        normalizedMime.startsWith("text/") ||
        normalizedMime === "application/json" ||
        normalizedMime === "application/xml" ||
        normalizedMime === "application/javascript" ||
        fileName.endsWith(".txt") ||
        fileName.endsWith(".json") ||
        fileName.endsWith(".xml") ||
        fileName.endsWith(".csv") ||
        fileName.endsWith(".log");


    if (isTextFile) {

        const text =
            document.createElement(
                "pre"
            );

        text.className =
            "utc-text-viewer";


        try {

            const decoded =
                new TextDecoder(
                    "utf-8"
                ).decode(
                    base64ToUint8Array(
                        data.contentBase64
                    )
                );


            text.textContent =
                decoded;


        } catch (error) {

            text.textContent =
                "Unable to read this text file.";
        }


        return text;
    }


    /*
     * IMAGE
     */

    if (
        normalizedMime.startsWith(
            "image/"
        )
    ) {

        const image =
            document.createElement(
                "img"
            );

        image.src =
            url;

        image.alt =
            file.name;

        image.className =
            "utc-image-viewer";

        return image;
    }


    /*
     * VIDEO
     */

    if (
        normalizedMime.startsWith(
            "video/"
        )
    ) {

        const video =
            document.createElement(
                "video"
            );

        video.src =
            url;

        video.controls =
            true;

        video.autoplay =
            false;

        video.preload =
            "metadata";

        video.className =
            "utc-video-viewer";

        return video;
    }


    /*
     * AUDIO
     */

    if (
        normalizedMime.startsWith(
            "audio/"
        )
    ) {

        const audio =
            document.createElement(
                "audio"
            );

        audio.src =
            url;

        audio.controls =
            true;

        audio.preload =
            "metadata";

        audio.className =
            "utc-audio-viewer";

        return audio;
    }


    /*
     * PDF
     */

    if (
        normalizedMime ===
            "application/pdf" ||
        fileName.endsWith(".pdf")
    ) {

        const iframe =
            document.createElement(
                "iframe"
            );

        iframe.src =
            url;

        iframe.className =
            "utc-pdf-viewer";

        iframe.title =
            file.name;

        return iframe;
    }


    /*
     * FALLBACK
     */

    const unsupported =
        document.createElement(
            "div"
        );

    unsupported.className =
        "utc-unsupported-viewer";


    unsupported.innerHTML =
        `
        <strong>
            ${escapeHtml(file.name)}
        </strong>
        <br><br>
        This file type cannot be previewed directly
        inside the UTC Mysterious viewer yet.
        `;


    return unsupported;
}


/* ==================================================
   MIME GUESS
   ================================================== */

function guessMimeTypeFromFilename(
    filename
) {

    const name =
        String(filename || "")
            .toLowerCase();


    if (name.endsWith(".txt")) {
        return "text/plain";
    }

    if (name.endsWith(".json")) {
        return "application/json";
    }

    if (name.endsWith(".pdf")) {
        return "application/pdf";
    }

    if (
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg")
    ) {
        return "image/jpeg";
    }

    if (name.endsWith(".png")) {
        return "image/png";
    }

    if (name.endsWith(".webp")) {
        return "image/webp";
    }

    if (name.endsWith(".gif")) {
        return "image/gif";
    }

    if (name.endsWith(".mp4")) {
        return "video/mp4";
    }

    if (name.endsWith(".webm")) {
        return "video/webm";
    }

    if (name.endsWith(".mp3")) {
        return "audio/mpeg";
    }

    if (name.endsWith(".wav")) {
        return "audio/wav";
    }

    if (name.endsWith(".ogg")) {
        return "audio/ogg";
    }

    return "application/octet-stream";
}


/* ==================================================
   HTML ESCAPE
   ================================================== */

function escapeHtml(value) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}


/* ==================================================
   BASE64
   ================================================== */

function base64ToUint8Array(
    base64
) {

    const binary =
        atob(base64);


    const bytes =
        new Uint8Array(
            binary.length
        );


    for (
        let i = 0;
        i < binary.length;
        i++
    ) {

        bytes[i] =
            binary.charCodeAt(i);
    }


    return bytes;
}


/* ==================================================
   PACKAGE INPUT
   ================================================== */

async function utcTrack(type, extra = {}) { try { if (!currentPackage || !currentPackage.packageId) return; await fetch(`${BACKEND_URL}/tracking/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageId: currentPackage.packageId, type, ...extra }) }); } catch (error) { console.warn('UTC tracking failed:', error); } }

async function handlePackageFile(
    file
) {

    hideMessage();


    try {

        const text =
            await file.text();


        const packageData =
            JSON.parse(text);


        if (
            !packageData.packageId ||
            !Array.isArray(
                packageData.files
            )
        ) {

            throw new Error(
                "Invalid UTC package."
            );
        }


        currentPackage =
            packageData;


        /*
         * Every newly loaded package starts
         * its viewer progression from File 1.
         */

        completedFiles =
            new Set();


        packageIdElement.textContent =
            packageData.packageId;


        welcome.classList.add(
            "hidden"
        );


        packagePanel.classList.remove(
            "hidden"
        );


        await loadPackageStatus();


        if (refreshTimer) {

            clearInterval(
                refreshTimer
            );
        }


        refreshTimer =
            setInterval(
                loadPackageStatus,
                1000
            );


    } catch (error) {

        showMessage(
            error.message ||
            "Unable to open UTC package."
        );
    }
}


async function loadDirectPackage(packageId) {

    hideMessage();

    try {

        const response = await fetch(
            `${BACKEND_URL}/package/${encodeURIComponent(packageId)}`
        );

        const packageData = await response.json();

        if (!response.ok || !packageData.ok || !packageData.packageId || !Array.isArray(packageData.files)) {
            throw new Error(packageData.error || "Unable to load UTC package.");
        }

        currentPackage = packageData;
        completedFiles = new Set();

        packageIdElement.textContent = packageData.packageId;

        welcome.classList.add("hidden");
        packagePanel.classList.remove("hidden");

        await loadPackageStatus();

        if (refreshTimer) {
            clearInterval(refreshTimer);
        }

        refreshTimer = setInterval(loadPackageStatus, 1000);

    } catch (error) {

        showMessage(
            error.message || "Unable to open UTC package."
        );
    }
}

/* ==================================================
   PACKAGE SELECT
   ================================================== */

packageInput.addEventListener(
    "change",
    async event => {

        const file =
            event.target.files?.[0];

        if (!file) {
            return;
        }

        alert("UTC FILE SELECTED: " + file.name);

        await handlePackageFile(
            file
        );
    }
);


/* ==================================================
   REFRESH
   ================================================== */

reloadPackageButton.addEventListener(
    "click",
    async () => {

        await checkBackend();

        await loadPackageStatus();
    }
);


/* ==================================================
   START
   ================================================== */

checkBackend();




