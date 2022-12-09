export interface Sound {
    resourceId: string,
    duration: number,
}

export const prefabs: any = {
    sounds: {
        ball: [
            {
                resourceId: "artifact:2153078194444436342",
                duration: 1
            },
            {
                resourceId: "artifact:2153078192607331180",
                duration: 1
            },
            {
                resourceId: "artifact:2153078192741548909",
                duration: 1
            },
            {
                resourceId: "artifact:2153078192347284331",
                duration: 1
            }
        ],
        rail: [
            {
                resourceId: "artifact:2153078194184389492",
                duration: 1
            },
            {
                resourceId: "artifact:2153078194972918649",
                duration: 1
            }
        ],
        cue: [
            {
                resourceId: "artifact:2153078194578654071",
                duration: 1
            }
        ]
    },
    balls: {
        orange: "artifact:2153078195232965499",
        blue: "artifact:2153078193530078065",
        black: "artifact:2153078195098747770",
        cue: "artifact:2153078192875766638"
    },
    cues: {
        cue1: "artifact:2153078194050171763",
        cue2: "artifact:2153078194704483192"
    },
    table: "artifact:2153078193395860336",
    laser: "artifact:2153175137828995245",
    grab: "artifact:2153078193790124914",
    marker: "artifact:2153078193135813487"
}