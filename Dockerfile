FROM adamliter/psiturk:latest

RUN pip3 install pandas scipy matplotlib seaborn spacy
RUN python3 -m spacy download en

COPY materials /materials
